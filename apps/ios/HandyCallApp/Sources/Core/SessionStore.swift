import Foundation
import SwiftUI

// Returns true when the JWT's exp claim is within `bufferSeconds` of now (or already past).
private func jwtIsExpiredOrExpiring(_ jwt: String, bufferSeconds: TimeInterval = 5 * 60) -> Bool {
    let parts = jwt.split(separator: ".").map(String.init)
    guard parts.count == 3 else { return true }
    var payload = parts[1]
    let remainder = payload.count % 4
    if remainder != 0 { payload += String(repeating: "=", count: 4 - remainder) }
    guard
        let data = Data(base64Encoded: payload),
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
        let exp = json["exp"] as? TimeInterval
    else { return true }
    return Date().timeIntervalSince1970 >= exp - bufferSeconds
}

@MainActor
final class SessionStore: ObservableObject {
    @Published private(set) var session: AuthSession?
    @Published private(set) var company: Company?
    @Published var isLoading = false
    @Published var authError: String?

    private let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
        restore()
    }

    var isAuthenticated: Bool {
        session != nil
    }

    func login(email: String, password: String) async {
        isLoading = true
        authError = nil
        defer { isLoading = false }

        do {
            let response = try await apiClient.login(email: email, password: password)
            if response.requiresPasswordChange {
                authError = "Password reset is required for this account. Use Forgot Password to continue."
                return
            }

            guard let accessToken = response.accessToken, let idToken = response.idToken else {
                authError = "Sign in failed. Missing authentication tokens."
                return
            }
            let resolvedEmail = response.email ?? email
            let auth = AuthSession(
                accessToken: accessToken,
                idToken: idToken,
                refreshToken: response.refreshToken,
                email: resolvedEmail
            )
            apply(session: auth)
            company = try await apiClient.getMyCompany()
        } catch {
            authError = error.localizedDescription
        }
    }

    func refreshCompany() async {
        guard session != nil else { return }
        do {
            company = try await apiClient.getMyCompany()
        } catch {
            // Keep previous company data on transient refresh failures.
        }
    }

    func completeSocialLogin(_ social: SocialAuthResult) async {
        isLoading = true
        authError = nil
        defer { isLoading = false }

        let auth = AuthSession(
            accessToken: social.accessToken,
            idToken: social.idToken,
            refreshToken: social.refreshToken,
            email: social.email
        )
        apply(session: auth)

        do {
            company = try await apiClient.getMyCompany()
        } catch {
            authError = error.localizedDescription
            logout()
        }
    }

    func logout() {
        session = nil
        company = nil
        apiClient.setBearerToken(nil)
        KeychainStore.remove("id_token")
        KeychainStore.remove("access_token")
        KeychainStore.remove("refresh_token")
        KeychainStore.remove("email")
    }

    /// Tries to exchange the stored refresh token for fresh access/id tokens.
    /// Calls `logout()` and returns `false` if the refresh fails or no refresh token is available.
    @discardableResult
    func refreshSession() async -> Bool {
        guard
            let currentSession = session,
            let refreshToken = currentSession.refreshToken
        else {
            logout()
            return false
        }
        do {
            let response = try await apiClient.refresh(refreshToken: refreshToken, email: currentSession.email)
            let updated = AuthSession(
                accessToken: response.accessToken,
                idToken: response.idToken,
                refreshToken: refreshToken,
                email: currentSession.email
            )
            apply(session: updated)
            return true
        } catch {
            logout()
            return false
        }
    }

    /// Called when the app returns to foreground. Silently refreshes tokens if they are
    /// expired or about to expire (within 5 minutes). Logs out if refresh is impossible.
    func validateAndRefreshIfNeeded() async {
        guard let current = session else { return }
        guard jwtIsExpiredOrExpiring(current.idToken) else { return }
        await refreshSession()
    }

    private func restore() {
        guard
            let idToken = KeychainStore.load("id_token"),
            let accessToken = KeychainStore.load("access_token"),
            let email = KeychainStore.load("email")
        else { return }

        let restored = AuthSession(
            accessToken: accessToken,
            idToken: idToken,
            refreshToken: KeychainStore.load("refresh_token"),
            email: email
        )
        apply(session: restored)

        // Proactively refresh if the stored token is already expired or expiring soon.
        if jwtIsExpiredOrExpiring(idToken) {
            Task { await self.refreshSession() }
        }
    }

    private func apply(session: AuthSession) {
        self.session = session
        apiClient.setBearerToken(session.idToken)
        KeychainStore.save(session.idToken, for: "id_token")
        KeychainStore.save(session.accessToken, for: "access_token")
        KeychainStore.save(session.email, for: "email")
        if let refresh = session.refreshToken {
            KeychainStore.save(refresh, for: "refresh_token")
        }
    }
}
