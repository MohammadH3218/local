import Foundation

struct LoginRequest: Encodable {
    let email: String
    let password: String
}

struct LoginResponse: Decodable {
    let requiresPasswordChange: Bool
    let accessToken: String?
    let idToken: String?
    let refreshToken: String?
    let session: String?
    let email: String?
    let userRole: String?

    enum CodingKeys: String, CodingKey {
        case requiresPasswordChange
        case accessToken = "access_token"
        case idToken = "id_token"
        case refreshToken = "refresh_token"
        case session
        case email
        case userRole
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        requiresPasswordChange = (try? container.decode(Bool.self, forKey: .requiresPasswordChange)) ?? false
        accessToken = try? container.decode(String.self, forKey: .accessToken)
        idToken = try? container.decode(String.self, forKey: .idToken)
        refreshToken = try? container.decode(String.self, forKey: .refreshToken)
        session = try? container.decode(String.self, forKey: .session)
        email = try? container.decode(String.self, forKey: .email)
        userRole = try? container.decode(String.self, forKey: .userRole)
    }
}

struct RefreshResponse: Decodable {
    let accessToken: String
    let idToken: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case idToken = "id_token"
    }
}

struct AuthSession: Codable {
    let accessToken: String
    let idToken: String
    let refreshToken: String?
    let email: String
}

struct RegisterRequest: Encodable {
    let companyName: String?
    let serviceType: String?
    let email: String
    let password: String
    let phoneNumber: String?
    let firstName: String?
    let lastName: String?
    let timezone: String?

    enum CodingKeys: String, CodingKey {
        case companyName = "company_name"
        case serviceType = "service_type"
        case email
        case password
        case phoneNumber = "phone_number"
        case firstName = "first_name"
        case lastName = "last_name"
        case timezone
    }
}

struct RegisterResponse: Decodable {
    let ok: Bool
    let email: String?
    let requiresEmailVerification: Bool?

    enum CodingKeys: String, CodingKey {
        case ok
        case email
        case requiresEmailVerification = "requires_email_verification"
    }
}

struct ConfirmSignUpRequest: Encodable {
    let email: String
    let code: String
}

struct ResendConfirmationRequest: Encodable {
    let email: String
}

struct ForgotPasswordRequest: Encodable {
    let email: String
}

struct ConfirmForgotPasswordRequest: Encodable {
    let email: String
    let token: String
    let newPassword: String

    enum CodingKeys: String, CodingKey {
        case email
        case token
        case newPassword = "new_password"
    }
}

struct OkResponse: Decodable {
    let ok: Bool?
}
