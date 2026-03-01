import Foundation

struct NotificationEventMeta: Decodable, Identifiable {
    var id: String { eventKey }

    let eventKey: String
    let label: String
    let category: String
    let description: String

    enum CodingKeys: String, CodingKey {
        case eventKey = "event_key"
        case label
        case category
        case description
    }
}

struct NotificationToggle: Codable {
    var inApp: Bool
    var push: Bool

    enum CodingKeys: String, CodingKey {
        case inApp = "in_app"
        case push
    }
}

struct NotificationPreferencePayload: Decodable {
    let preferences: [String: NotificationToggle]
}

struct NotificationPreferenceUpdateRequest: Encodable {
    let preferences: [String: NotificationToggle]
}

struct NotificationItem: Decodable, Identifiable {
    var id: String { notificationID }

    let notificationID: String
    let eventKey: String
    let category: String
    let title: String
    let body: String
    let isRead: Bool
    let createdAt: Double
    let actionURL: String?

    enum CodingKeys: String, CodingKey {
        case notificationID = "notification_id"
        case eventKey = "event_key"
        case category
        case title
        case body
        case isRead = "is_read"
        case createdAt = "created_at"
        case actionURL = "action_url"
    }
}

struct NotificationListResponse: Decodable {
    let notifications: [NotificationItem]
}

struct NotificationUnreadCount: Decodable {
    let unread: Int
}

struct NotificationDeviceRegistrationRequest: Encodable {
    let deviceID: String
    let platform: String
    let apnsToken: String
    let apnsEnvironment: String
    let appVersion: String?
    let deviceModel: String?
    let locale: String?
    let pushEnabled: Bool

    enum CodingKeys: String, CodingKey {
        case deviceID = "device_id"
        case platform
        case apnsToken = "apns_token"
        case apnsEnvironment = "apns_environment"
        case appVersion = "app_version"
        case deviceModel = "device_model"
        case locale
        case pushEnabled = "push_enabled"
    }
}
