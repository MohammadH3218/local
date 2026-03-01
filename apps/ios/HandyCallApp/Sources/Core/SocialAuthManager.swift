import AuthenticationServices
import CryptoKit
import Foundation
import UIKit

enum SocialAuthProvider: String {
    case google = "Google"
    case apple = "SignInWithApple"
}

enum SocialAuthError: LocalizedError {
    case invalidAuthorizationURL
    case invalidCallback
    case stateMismatch
    case missingCode
    case tokenExchangeFailed
    case missingIDToken
    case missingEmail

    var errorDescription: String? {
        switch self {
        case .invalidAuthorizationURL:
            return "Could not start social sign-in."
        case .invalidCallback:
            return "Invalid sign-in callback."
        case .stateMismatch:
            return "Invalid OAuth state. Please try again."
        case .missingCode:
            return "Authorization code was not returned."
        case .tokenExchangeFailed:
            return "Could not complete social sign-in."
        case .missingIDToken:
            return "Missing identity token from provider."
        case .missingEmail:
            return "Email was not provided by social provider."
        }
    }
}

struct SocialAuthResult {
    let accessToken: String
    let idToken: String
    let refreshToken: String?
    let email: String
}

@MainActor
final class SocialAuthManager: NSObject {
    private lazy var presentationProvider = WebAuthPresentationContextProvider()

    func authenticate(with provider: SocialAuthProvider) async throws -> SocialAuthResult {
        let state = Self.randomURLSafeString(length: 32)
        let verifier = Self.randomURLSafeString(length: 64)
        let challenge = Self.pkceChallenge(for: verifier)

        var components = URLComponents(url: AppConfig.cognitoAuthBaseURL.appendingPathComponent("/oauth2/authorize"), resolvingAgainstBaseURL: false)
        components?.queryItems = [
            URLQueryItem(name: "identity_provider", value: provider.rawValue),
            URLQueryItem(name: "redirect_uri", value: AppConfig.oauthRedirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: AppConfig.cognitoClientID),
            URLQueryItem(name: "scope", value: "openid email profile"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "code_challenge", value: challenge),
        ]

        guard let authorizationURL = components?.url else {
            throw SocialAuthError.invalidAuthorizationURL
        }

        let callbackURL = try await startWebAuthentication(url: authorizationURL)
        guard let callbackComponents = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false) else {
            throw SocialAuthError.invalidCallback
        }

        if let errorMessage = callbackComponents.queryItems?.first(where: { $0.name == "error_description" })?.value
            ?? callbackComponents.queryItems?.first(where: { $0.name == "error" })?.value {
            throw APIError.server(message: errorMessage.removingPercentEncoding ?? errorMessage)
        }

        guard
            let returnedState = callbackComponents.queryItems?.first(where: { $0.name == "state" })?.value,
            returnedState == state
        else {
            throw SocialAuthError.stateMismatch
        }
        guard let code = callbackComponents.queryItems?.first(where: { $0.name == "code" })?.value else {
            throw SocialAuthError.missingCode
        }

        let tokenResponse = try await exchangeCodeForTokens(code: code, codeVerifier: verifier)
        guard let idToken = tokenResponse.idToken else {
            throw SocialAuthError.missingIDToken
        }

        let email = Self.emailFromJWT(idToken) ?? tokenResponse.email
        guard let email, !email.isEmpty else {
            throw SocialAuthError.missingEmail
        }
        guard let accessToken = tokenResponse.accessToken else {
            throw SocialAuthError.tokenExchangeFailed
        }

        return SocialAuthResult(
            accessToken: accessToken,
            idToken: idToken,
            refreshToken: tokenResponse.refreshToken,
            email: email
        )
    }

    private func startWebAuthentication(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: AppConfig.oauthRedirectScheme
            ) { callbackURL, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let callbackURL else {
                    continuation.resume(throwing: SocialAuthError.invalidCallback)
                    return
                }
                continuation.resume(returning: callbackURL)
            }
            session.prefersEphemeralWebBrowserSession = false
            session.presentationContextProvider = presentationProvider
            session.start()
        }
    }

    private func exchangeCodeForTokens(code: String, codeVerifier: String) async throws -> TokenExchangeResponse {
        var request = URLRequest(url: AppConfig.cognitoAuthBaseURL.appendingPathComponent("/oauth2/token"))
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        var parts = URLComponents()
        parts.queryItems = [
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "client_id", value: AppConfig.cognitoClientID),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "redirect_uri", value: AppConfig.oauthRedirectURI),
            URLQueryItem(name: "code_verifier", value: codeVerifier),
        ]
        request.httpBody = parts.percentEncodedQuery?.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw SocialAuthError.tokenExchangeFailed
        }

        if !(200...299).contains(http.statusCode) {
            if
                let payload = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let message = payload["error_description"] as? String ?? payload["error"] as? String
            {
                throw APIError.server(message: message)
            }
            throw SocialAuthError.tokenExchangeFailed
        }

        guard let decoded = try? JSONDecoder().decode(TokenExchangeResponse.self, from: data) else {
            throw SocialAuthError.tokenExchangeFailed
        }
        return decoded
    }

    private static func randomURLSafeString(length: Int) -> String {
        let chars = Array("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        return String((0..<length).compactMap { _ in chars.randomElement() })
    }

    private static func pkceChallenge(for verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return Data(digest).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func emailFromJWT(_ token: String) -> String? {
        let parts = token.split(separator: ".")
        guard parts.count > 1 else { return nil }
        var base64 = String(parts[1]).replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        let pad = 4 - (base64.count % 4)
        if pad < 4 {
            base64 += String(repeating: "=", count: pad)
        }
        guard
            let data = Data(base64Encoded: base64),
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return nil
        }
        return object["email"] as? String
    }
}

private struct TokenExchangeResponse: Decodable {
    let accessToken: String?
    let idToken: String?
    let refreshToken: String?
    let email: String?

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case idToken = "id_token"
        case refreshToken = "refresh_token"
        case email
    }
}

private final class WebAuthPresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow) ?? ASPresentationAnchor()
    }
}
