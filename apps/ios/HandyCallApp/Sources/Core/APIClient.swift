import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case invalidResponse
    case unauthorized
    case server(message: String)
    case decoding

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Invalid request URL."
        case .invalidResponse:
            return "Invalid server response."
        case .unauthorized:
            return "Your session expired. Please sign in again."
        case .server(let message):
            return message
        case .decoding:
            return "Could not parse server data."
        }
    }
}

private struct APIEnvelope<T: Decodable>: Decodable {
    let success: Bool?
    let data: T?
    let error: APIEnvelopeError?
}

private struct APIEnvelopeError: Decodable {
    let code: String?
    let message: String?
}

final class APIClient: @unchecked Sendable {
    private let baseURL: URL
    private let session: URLSession
    private let stateQueue = DispatchQueue(label: "org.handycall.api-client.state")
    private var bearerToken: String?
    // Called on the main actor when a 401/403 is received and the session must be invalidated.
    var onSessionExpired: (@MainActor @Sendable () -> Void)?

    init(baseURL: URL = AppConfig.apiBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func setBearerToken(_ token: String?) {
        stateQueue.sync {
            self.bearerToken = token
        }
    }

    func login(email: String, password: String) async throws -> LoginResponse {
        try await request(
            path: "/auth/login",
            method: "POST",
            body: LoginRequest(email: email, password: password),
            requiresAuth: false
        )
    }

    func register(_ payload: RegisterRequest) async throws -> RegisterResponse {
        try await request(path: "/auth/register", method: "POST", body: payload, requiresAuth: false)
    }

    func confirmSignUp(email: String, code: String) async throws {
        _ = try await request(
            path: "/auth/confirm-signup",
            method: "POST",
            body: ConfirmSignUpRequest(email: email, code: code),
            requiresAuth: false
        ) as OkResponse
    }

    func resendConfirmation(email: String) async throws {
        _ = try await request(
            path: "/auth/resend-confirmation",
            method: "POST",
            body: ResendConfirmationRequest(email: email),
            requiresAuth: false
        ) as OkResponse
    }

    func requestPasswordReset(email: String) async throws {
        _ = try await request(
            path: "/auth/forgot-password",
            method: "POST",
            body: ForgotPasswordRequest(email: email),
            requiresAuth: false
        ) as OkResponse
    }

    func confirmPasswordReset(email: String, token: String, newPassword: String) async throws {
        _ = try await request(
            path: "/auth/confirm-forgot-password",
            method: "POST",
            body: ConfirmForgotPasswordRequest(email: email, token: token, newPassword: newPassword),
            requiresAuth: false
        ) as OkResponse
    }

    func refresh(refreshToken: String, email: String) async throws -> RefreshResponse {
        struct RefreshBody: Encodable {
            let refresh_token: String
            let email: String
        }
        return try await request(path: "/auth/refresh", method: "POST", body: RefreshBody(refresh_token: refreshToken, email: email), requiresAuth: false)
    }

    func getMyCompany() async throws -> Company {
        try await request(path: "/companies/me", method: "GET")
    }

    func updateMyCompanyAutomation(
        followUpSequencesEnabled: Bool?,
        reviewRequestEnabled: Bool?,
        reviewRequestDelayMinutes: Int?,
        reviewPlatformURL: String?,
        reviewRequestTemplate: String?
    ) async throws -> Company {
        struct Body: Encodable {
            let follow_up_sequences_enabled: Bool?
            let review_request_enabled: Bool?
            let review_request_delay_minutes: Int?
            let review_platform_url: String?
            let review_request_template: String?
        }

        let body = Body(
            follow_up_sequences_enabled: followUpSequencesEnabled,
            review_request_enabled: reviewRequestEnabled,
            review_request_delay_minutes: reviewRequestDelayMinutes,
            review_platform_url: reviewPlatformURL,
            review_request_template: reviewRequestTemplate
        )

        return try await request(path: "/companies/me", method: "PUT", body: body)
    }

    func getDashboardStats() async throws -> DashboardOverview {
        try await request(path: "/dashboard/stats", method: "GET")
    }

    func getUpcomingAppointments(limit: Int = 10) async throws -> [Appointment] {
        let all: [Appointment] = try await request(path: "/dashboard/upcoming-appointments", method: "GET")
        if all.count <= limit {
            return all
        }
        return Array(all.prefix(limit))
    }

    func getAppointments(limit: Int = 50) async throws -> [Appointment] {
        struct Response: Decodable { let appointments: [Appointment] }
        let response: Response = try await request(path: "/appointments?limit=\(limit)", method: "GET")
        return response.appointments
    }

    func getAppointmentByID(_ appointmentID: String) async throws -> Appointment {
        try await request(path: "/appointments/\(appointmentID)", method: "GET")
    }

    func getCalls(limit: Int = 50) async throws -> [CallItem] {
        struct Response: Decodable { let calls: [CallItem] }
        let response: Response = try await request(path: "/calls?limit=\(limit)", method: "GET")
        return response.calls
    }

    func getCallByID(_ callID: String) async throws -> CallItem {
        try await request(path: "/calls/\(callID)", method: "GET")
    }

    func getCallRecordingURL(_ callID: String) async throws -> String {
        struct Response: Decodable { let url: String }
        let response: Response = try await request(path: "/calls/\(callID)/recording", method: "GET")
        return response.url
    }

    func getContacts(limit: Int = 50) async throws -> [ContactItem] {
        struct Response: Decodable { let contacts: [ContactItem] }
        let response: Response = try await request(path: "/contacts?limit=\(limit)", method: "GET")
        return response.contacts
    }

    func getContactByID(_ contactID: String) async throws -> ContactItem {
        try await request(path: "/contacts/\(contactID)", method: "GET")
    }

    func getContactCalls(contactID: String, limit: Int = 50) async throws -> [CallItem] {
        struct Response: Decodable { let calls: [CallItem] }
        let response: Response = try await request(path: "/contacts/\(contactID)/calls?limit=\(limit)", method: "GET")
        return response.calls
    }

    func getContactAppointments(contactID: String) async throws -> [Appointment] {
        struct Response: Decodable { let appointments: [Appointment] }
        let response: Response = try await request(path: "/contacts/\(contactID)/appointments", method: "GET")
        return response.appointments
    }

    func getNotificationEvents() async throws -> [NotificationEventMeta] {
        struct Response: Decodable { let events: [NotificationEventMeta] }
        let response: Response = try await request(path: "/notifications/events", method: "GET")
        return response.events
    }

    func getNotificationPreferences() async throws -> [String: NotificationToggle] {
        let response: NotificationPreferencePayload = try await request(path: "/notifications/preferences", method: "GET")
        return response.preferences
    }

    func updateNotificationPreferences(_ preferences: [String: NotificationToggle]) async throws {
        let body = NotificationPreferenceUpdateRequest(preferences: preferences)
        _ = try await request(path: "/notifications/preferences", method: "PUT", body: body) as NotificationPreferencePayload
    }

    func getNotifications(limit: Int = 50, unreadOnly: Bool = false) async throws -> [NotificationItem] {
        let path = "/notifications?limit=\(limit)&unread_only=\(unreadOnly ? "true" : "false")"
        let response: NotificationListResponse = try await request(path: path, method: "GET")
        return response.notifications
    }

    func getUnreadNotificationCount() async throws -> Int {
        let response: NotificationUnreadCount = try await request(path: "/notifications/unread-count", method: "GET")
        return response.unread
    }

    func markNotificationRead(notificationID: String) async throws {
        struct Empty: Decodable {}
        _ = try await request(path: "/notifications/\(notificationID)/read", method: "POST") as Empty
    }

    func markAllNotificationsRead() async throws {
        struct Empty: Decodable {}
        _ = try await request(path: "/notifications/read-all", method: "POST") as Empty
    }

    // MARK: - Messages

    func getMessageThreads(limit: Int = 50) async throws -> [MessageThread] {
        struct Response: Decodable { let threads: [MessageThread] }
        let response: Response = try await request(path: "/messages/threads?limit=\(limit)", method: "GET")
        return response.threads
    }

    func getMessageThread(contactID: String, limit: Int = 100) async throws -> [MessageItem] {
        struct Response: Decodable {
            let messages: [MessageItem]?
            let thread: MessageThread?
        }
        let response: Response = try await request(path: "/messages/threads/\(contactID)?limit=\(limit)", method: "GET")
        return response.messages ?? []
    }

    // MARK: - Knowledge Base

    func getKnowledgeItems(type: String? = nil, status: String? = nil, limit: Int = 100) async throws -> [KnowledgeItem] {
        var path = "/knowledge-items?limit=\(limit)"
        if let type { path += "&type=\(type)" }
        if let status { path += "&status=\(status)" }
        struct Response: Decodable {
            let items: [KnowledgeItem]?
            let knowledge: [KnowledgeItem]?
        }
        let response: Response = try await request(path: path, method: "GET")
        return response.items ?? response.knowledge ?? []
    }

    func createKnowledgeItem(title: String, content: String, type: String, status: String, tags: [String]) async throws -> KnowledgeItem {
        struct Body: Encodable {
            let title: String
            let content: String
            let type: String
            let status: String
            let tags: [String]
        }
        struct Response: Decodable { let item: KnowledgeItem? }
        let body = Body(title: title, content: content, type: type, status: status, tags: tags)
        if let response = try? await request(path: "/knowledge-items", method: "POST", body: body) as Response,
           let item = response.item {
            return item
        }
        return try await request(path: "/knowledge-items", method: "POST", body: body)
    }

    func updateKnowledgeItem(id: String, title: String, content: String, type: String, status: String, tags: [String]) async throws -> KnowledgeItem {
        struct Body: Encodable {
            let title: String
            let content: String
            let type: String
            let status: String
            let tags: [String]
        }
        struct Response: Decodable { let item: KnowledgeItem? }
        let body = Body(title: title, content: content, type: type, status: status, tags: tags)
        if let response = try? await request(path: "/knowledge-items/\(id)", method: "PUT", body: body) as Response,
           let item = response.item {
            return item
        }
        return try await request(path: "/knowledge-items/\(id)", method: "PUT", body: body)
    }

    func deleteKnowledgeItem(id: String) async throws {
        struct Empty: Decodable {}
        _ = try await request(path: "/knowledge-items/\(id)", method: "DELETE") as Empty
    }

    // MARK: - Usage

    func getUsageMetrics() async throws -> UsageInfo {
        struct Response: Decodable { let usage: UsageInfo? }
        if let response = try? await request(path: "/billing/usage", method: "GET") as Response,
           let usage = response.usage {
            return usage
        }
        return try await request(path: "/billing/usage", method: "GET")
    }

    func registerPushDevice(token: String) async throws {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String
        let normalizedVersion: String? = {
            if let version, let build { return "\(version) (\(build))" }
            return version ?? build
        }()

        let body = NotificationDeviceRegistrationRequest(
            deviceID: deviceIdentifier(),
            platform: "IOS",
            apnsToken: token,
            apnsEnvironment: AppConfig.apnsEnvironment.rawValue,
            appVersion: normalizedVersion,
            deviceModel: nil,
            locale: Locale.current.identifier,
            pushEnabled: true
        )
        struct Empty: Decodable {}
        _ = try await request(path: "/notifications/devices", method: "POST", body: body) as Empty
    }

    private func deviceIdentifier() -> String {
        if let cached = UserDefaults.standard.string(forKey: "handycall.device_id"), !cached.isEmpty {
            return cached
        }
        let generated = UUID().uuidString
        UserDefaults.standard.set(generated, forKey: "handycall.device_id")
        return generated
    }

    private func request<T: Decodable, Body: Encodable>(
        path: String,
        method: String,
        body: Body,
        requiresAuth: Bool = true
    ) async throws -> T {
        var request = try makeRequest(path: path, method: method, requiresAuth: requiresAuth)
        request.httpBody = try JSONEncoder().encode(body)
        return try await execute(request)
    }

    private func request<T: Decodable>(
        path: String,
        method: String,
        requiresAuth: Bool = true
    ) async throws -> T {
        let request = try makeRequest(path: path, method: method, requiresAuth: requiresAuth)
        return try await execute(request)
    }

    private func makeRequest(path: String, method: String, requiresAuth: Bool) throws -> URLRequest {
        let base = baseURL.absoluteString.hasSuffix("/") ? baseURL.absoluteString : "\(baseURL.absoluteString)/"
        let normalizedPath = path.hasPrefix("/") ? String(path.dropFirst()) : path
        guard let url = URL(string: "\(base)\(normalizedPath)") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 20

        if requiresAuth {
            let token = stateQueue.sync { bearerToken }
            guard let token else {
                throw APIError.unauthorized
            }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private func execute<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        if http.statusCode == 401 || http.statusCode == 403 {
            // Only trigger session expiry for authenticated requests (those that sent a Bearer token).
            // Unauthenticated endpoints like /auth/login can also return 401 for bad credentials —
            // in that case we should surface the server's error message, not "session expired".
            if request.value(forHTTPHeaderField: "Authorization") != nil {
                if let handler = stateQueue.sync(execute: { onSessionExpired }) {
                    Task { @MainActor in handler() }
                }
                throw APIError.unauthorized
            }
            // Parse the backend's error message for unauthenticated 401/403 responses.
            if let envelope = try? JSONDecoder().decode(APIEnvelope<T>.self, from: data),
               let message = envelope.error?.message {
                throw APIError.server(message: message)
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = (json["message"] as? String) ?? ((json["error"] as? String)) {
                throw APIError.server(message: message)
            }
            throw APIError.server(message: "Invalid credentials. Please try again.")
        }
        guard (200...299).contains(http.statusCode) else {
            if let envelope = try? JSONDecoder().decode(APIEnvelope<T>.self, from: data),
               let message = envelope.error?.message {
                throw APIError.server(message: message)
            }
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let message = (json["message"] as? String) ?? (json["error"] as? String) {
                throw APIError.server(message: message)
            }
            throw APIError.server(message: "Request failed with status \(http.statusCode)")
        }

        if let decoded = try? JSONDecoder().decode(T.self, from: data) {
            return decoded
        }
        if let envelope = try? JSONDecoder().decode(APIEnvelope<T>.self, from: data),
           let wrapped = envelope.data {
            return wrapped
        }

        if T.self == OkResponse.self, data.isEmpty {
            return OkResponse(ok: true) as! T
        }
        throw APIError.decoding
    }
}
