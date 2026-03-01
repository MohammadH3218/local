import Foundation

struct Company: Decodable {
    let companyID: String
    let companyName: String
    let timezone: String?
    let serviceType: String?
    let status: String?
    let subscriptionPlan: String?
    let followUpSequencesEnabled: Bool?
    let reviewRequestEnabled: Bool?
    let reviewRequestDelayMinutes: Int?
    let reviewPlatformURL: String?
    let reviewRequestTemplate: String?
    let websiteWidgetEnabled: Bool?

    enum CodingKeys: String, CodingKey {
        case companyID = "company_id"
        case companyName = "company_name"
        case timezone
        case serviceType = "service_type"
        case status
        case subscriptionPlan = "subscription_plan"
        case followUpSequencesEnabled = "follow_up_sequences_enabled"
        case reviewRequestEnabled = "review_request_enabled"
        case reviewRequestDelayMinutes = "review_request_delay_minutes"
        case reviewPlatformURL = "review_platform_url"
        case reviewRequestTemplate = "review_request_template"
        case websiteWidgetEnabled = "website_widget_enabled"
    }
}

struct DashboardOverview: Decodable {
    struct Metrics: Decodable {
        let revenueThisMonthCents: Int
        let leadConversionRate: Double
        let totalCustomers: Int
        let activeLeads: Int
        let appointmentsThisWeek: Int

        enum CodingKeys: String, CodingKey {
            case revenueThisMonthCents = "revenue_this_month_cents"
            case leadConversionRate = "lead_conversion_rate"
            case totalCustomers = "total_customers"
            case activeLeads = "active_leads"
            case appointmentsThisWeek = "appointments_this_week"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            revenueThisMonthCents = c.decodeLossyInt(forKey: .revenueThisMonthCents) ?? 0
            leadConversionRate = c.decodeLossyDouble(forKey: .leadConversionRate) ?? 0
            totalCustomers = c.decodeLossyInt(forKey: .totalCustomers) ?? 0
            activeLeads = c.decodeLossyInt(forKey: .activeLeads) ?? 0
            appointmentsThisWeek = c.decodeLossyInt(forKey: .appointmentsThisWeek) ?? 0
        }
    }

    struct UsageItem: Decodable {
        let used: Double
        let limit: Double
        let percent: Double
        let blocked: Bool

        init(used: Double, limit: Double, percent: Double, blocked: Bool) {
            self.used = used
            self.limit = limit
            self.percent = percent
            self.blocked = blocked
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            used = c.decodeLossyDouble(forKey: .used) ?? 0
            limit = c.decodeLossyDouble(forKey: .limit) ?? 0
            percent = c.decodeLossyDouble(forKey: .percent) ?? 0
            blocked = (try? c.decode(Bool.self, forKey: .blocked)) ?? false
        }

        enum CodingKeys: String, CodingKey {
            case used
            case limit
            case percent
            case blocked
        }
    }

    struct UsageSummary: Decodable {
        let periodStart: Double?
        let periodEnd: Double?
        let minutes: UsageItem
        let sms: UsageItem
        let contacts: UsageItem

        enum CodingKeys: String, CodingKey {
            case periodStart = "period_start"
            case periodEnd = "period_end"
            case minutes
            case sms
            case contacts
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            periodStart = c.decodeLossyDouble(forKey: .periodStart)
            periodEnd = c.decodeLossyDouble(forKey: .periodEnd)
            minutes = (try? c.decode(UsageItem.self, forKey: .minutes)) ?? UsageItem(used: 0, limit: 0, percent: 0, blocked: false)
            sms = (try? c.decode(UsageItem.self, forKey: .sms)) ?? UsageItem(used: 0, limit: 0, percent: 0, blocked: false)
            contacts = (try? c.decode(UsageItem.self, forKey: .contacts)) ?? UsageItem(used: 0, limit: 0, percent: 0, blocked: false)
        }
    }

    struct QuickAction: Decodable, Identifiable {
        var id: String
        let title: String
        let description: String
        let severity: String
        let count: Int
        let actionURL: String

        enum CodingKeys: String, CodingKey {
            case id
            case title
            case description
            case severity
            case count
            case actionURL = "action_url"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = c.decodeLossyString(forKey: .id) ?? UUID().uuidString
            title = c.decodeLossyString(forKey: .title) ?? "Action item"
            description = c.decodeLossyString(forKey: .description) ?? ""
            severity = c.decodeLossyString(forKey: .severity) ?? "LOW"
            count = c.decodeLossyInt(forKey: .count) ?? 0
            actionURL = c.decodeLossyString(forKey: .actionURL) ?? "/dashboard"
        }
    }

    struct QuickInsights: Decodable {
        let unansweredQuestions: Int
        let hotLeadsNeedingFollowUp: Int
        let appointmentsNext24h: Int
        let nextAppointmentCountdownMinutes: Int?
        let quickActions: [QuickAction]

        enum CodingKeys: String, CodingKey {
            case unansweredQuestions = "unanswered_questions"
            case hotLeadsNeedingFollowUp = "hot_leads_needing_follow_up"
            case appointmentsNext24h = "appointments_next_24h"
            case nextAppointmentCountdownMinutes = "next_appointment_countdown_minutes"
            case quickActions = "quick_actions"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            unansweredQuestions = c.decodeLossyInt(forKey: .unansweredQuestions) ?? 0
            hotLeadsNeedingFollowUp = c.decodeLossyInt(forKey: .hotLeadsNeedingFollowUp) ?? 0
            appointmentsNext24h = c.decodeLossyInt(forKey: .appointmentsNext24h) ?? 0
            nextAppointmentCountdownMinutes = c.decodeLossyInt(forKey: .nextAppointmentCountdownMinutes)
            quickActions = (try? c.decode([QuickAction].self, forKey: .quickActions)) ?? []
        }
    }

    struct ActivityItem: Decodable, Identifiable {
        let id: String
        let type: String
        let title: String
        let description: String
        let createdAt: Double
        let actionURL: String?

        enum CodingKeys: String, CodingKey {
            case id
            case type
            case title
            case description
            case createdAt = "created_at"
            case actionURL = "action_url"
        }

        init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = c.decodeLossyString(forKey: .id) ?? UUID().uuidString
            type = c.decodeLossyString(forKey: .type) ?? "SYSTEM"
            title = c.decodeLossyString(forKey: .title) ?? "Activity"
            description = c.decodeLossyString(forKey: .description) ?? ""
            createdAt = c.decodeLossyDouble(forKey: .createdAt) ?? 0
            actionURL = c.decodeLossyString(forKey: .actionURL)
        }
    }

    let metrics: Metrics
    let usageSummary: UsageSummary
    let quickInsights: QuickInsights
    let activityFeed: [ActivityItem]

    enum CodingKeys: String, CodingKey {
        case metrics
        case usageSummary = "usage_summary"
        case quickInsights = "quick_insights"
        case activityFeed = "activity_feed"
    }

    var usageBlocked: Bool {
        usageSummary.minutes.blocked || usageSummary.sms.blocked || usageSummary.contacts.blocked
    }
}

struct DashboardStats: Decodable {
    struct Snapshot: Decodable {
        let totalCalls: Int
        let aiHandledCalls: Int
        let newLeads: Int
        let appointmentsScheduled: Int
    }

    let today: Snapshot
    let week: Snapshot
    let pendingQuestions: Int

    enum CodingKeys: String, CodingKey {
        case today
        case week
        case todayCalls
        case newLeads
        case appointments
        case pendingQuestions
    }

    enum SnapshotCodingKeys: String, CodingKey {
        case totalCalls = "total_calls"
        case aiHandledCalls = "ai_handled_calls"
        case newLeads = "new_leads"
        case appointmentsScheduled = "appointments_scheduled"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        if container.contains(.today) || container.contains(.week) {
            let todayContainer = try? container.nestedContainer(keyedBy: SnapshotCodingKeys.self, forKey: .today)
            let weekContainer = try? container.nestedContainer(keyedBy: SnapshotCodingKeys.self, forKey: .week)
            let parsedTodayCalls = todayContainer?.decodeLossyInt(forKey: .totalCalls) ?? 0
            let parsedTodayLeads = todayContainer?.decodeLossyInt(forKey: .newLeads) ?? 0
            let parsedTodayAppointments = todayContainer?.decodeLossyInt(forKey: .appointmentsScheduled) ?? 0
            let parsedTodayAiHandled = todayContainer?.decodeLossyInt(forKey: .aiHandledCalls) ?? 0
            let parsedWeekCalls = weekContainer?.decodeLossyInt(forKey: .totalCalls) ?? parsedTodayCalls
            let parsedWeekLeads = weekContainer?.decodeLossyInt(forKey: .newLeads) ?? parsedTodayLeads
            let parsedWeekAppointments = weekContainer?.decodeLossyInt(forKey: .appointmentsScheduled) ?? parsedTodayAppointments
            let parsedWeekAiHandled = weekContainer?.decodeLossyInt(forKey: .aiHandledCalls) ?? parsedTodayAiHandled

            today = Snapshot(
                totalCalls: parsedTodayCalls,
                aiHandledCalls: parsedTodayAiHandled,
                newLeads: parsedTodayLeads,
                appointmentsScheduled: parsedTodayAppointments
            )
            week = Snapshot(
                totalCalls: parsedWeekCalls,
                aiHandledCalls: parsedWeekAiHandled,
                newLeads: parsedWeekLeads,
                appointmentsScheduled: parsedWeekAppointments
            )
            pendingQuestions = container.decodeLossyInt(forKey: .pendingQuestions) ?? 0
            return
        }

        // Current backend shape is flat. Map that into today + week to keep UI stable.
        let calls = container.decodeLossyInt(forKey: .todayCalls) ?? 0
        let leads = container.decodeLossyInt(forKey: .newLeads) ?? 0
        let appointmentsCount = container.decodeLossyInt(forKey: .appointments) ?? 0
        let pending = container.decodeLossyInt(forKey: .pendingQuestions) ?? 0
        today = Snapshot(totalCalls: calls, aiHandledCalls: 0, newLeads: leads, appointmentsScheduled: appointmentsCount)
        week = Snapshot(totalCalls: calls, aiHandledCalls: 0, newLeads: leads, appointmentsScheduled: appointmentsCount)
        pendingQuestions = pending
    }
}

struct Appointment: Decodable, Identifiable {
    var id: String { appointmentID }

    let appointmentID: String
    let status: String?
    let serviceType: String?
    let contactName: String?
    let contactEmail: String?
    let contactPhone: String?
    let scheduledStart: Double?
    let scheduledEnd: Double?
    let notes: String?
    let addressText: String?

    enum CodingKeys: String, CodingKey {
        case appointmentID = "appointment_id"
        case status
        case serviceType = "service_type"
        case contactName = "contact_name"
        case firstName = "first_name"
        case lastName = "last_name"
        case contactEmail = "contact_email"
        case contactPhone = "contact_phone"
        case phoneNumber = "phone_number"
        case scheduledStart = "scheduled_start"
        case scheduledEnd = "scheduled_end"
        case scheduledTime = "scheduled_time"
        case notes
        case address
        case addressFormatted = "address_formatted"
        case street
        case city
        case state
        case zip
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        appointmentID = try container.decode(String.self, forKey: .appointmentID)
        status = try? container.decode(String.self, forKey: .status)
        serviceType = try? container.decode(String.self, forKey: .serviceType)

        let explicitContactName = try? container.decode(String.self, forKey: .contactName)
        let firstName = try? container.decode(String.self, forKey: .firstName)
        let lastName = try? container.decode(String.self, forKey: .lastName)
        let combinedName = [firstName, lastName]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
        contactName = explicitContactName?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? combinedName.nonEmpty

        contactEmail = try? container.decode(String.self, forKey: .contactEmail)
        contactPhone = container.decodeLossyString(forAnyOfKeys: [.contactPhone, .phoneNumber])
        notes = try? container.decode(String.self, forKey: .notes)

        if let scheduledStartMs = container.decodeLossyDouble(forKey: .scheduledStart) {
            scheduledStart = scheduledStartMs
        } else {
            scheduledStart = container.decodeFlexibleDateMilliseconds(forKey: .scheduledTime)
        }

        scheduledEnd = container.decodeLossyDouble(forKey: .scheduledEnd)

        if let flatAddress = try? container.decode(String.self, forKey: .addressFormatted) {
            addressText = flatAddress.nonEmpty
        } else if let flatAddress = try? container.decode(String.self, forKey: .address) {
            addressText = flatAddress.nonEmpty
        } else {
            let street = (try? container.decode(String.self, forKey: .street))?.nonEmpty
            let city = (try? container.decode(String.self, forKey: .city))?.nonEmpty
            let state = (try? container.decode(String.self, forKey: .state))?.nonEmpty
            let zip = (try? container.decode(String.self, forKey: .zip))?.nonEmpty
            let cityStateZip = [city, [state, zip].compactMap { $0 }.joined(separator: " ")].compactMap { $0?.nonEmpty }.joined(separator: ", ")
            let line = [street, cityStateZip.nonEmpty].compactMap { $0 }.joined(separator: ", ")
            addressText = line.nonEmpty
        }
    }
}

struct CallItem: Decodable, Identifiable {
    var id: String { callID }

    let callID: String
    let callerPhone: String?
    let callerName: String?
    let createdAt: String?
    let duration: Double?
    let status: String?
    let summary: String?
    let transcript: String?
    let recordingURL: String?
    let outcome: String?
    let appointmentID: String?
    let contactID: String?

    enum CodingKeys: String, CodingKey {
        case callID = "call_id"
        case callerPhone = "caller_phone"
        case fromNumber = "from_number"
        case callerName = "caller_name"
        case createdAt = "created_at"
        case duration
        case durationSeconds = "duration_seconds"
        case status
        case summary
        case transcript
        case recordingURL = "recording_url"
        case outcome
        case appointmentID = "appointment_id"
        case contactID = "contact_id"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        callID = try container.decode(String.self, forKey: .callID)
        callerPhone = container.decodeLossyString(forAnyOfKeys: [.callerPhone, .fromNumber])
        callerName = try? container.decode(String.self, forKey: .callerName)
        status = try? container.decode(String.self, forKey: .status)
        summary = try? container.decode(String.self, forKey: .summary)
        transcript = try? container.decode(String.self, forKey: .transcript)
        recordingURL = try? container.decode(String.self, forKey: .recordingURL)
        outcome = try? container.decode(String.self, forKey: .outcome)
        appointmentID = try? container.decode(String.self, forKey: .appointmentID)
        contactID = try? container.decode(String.self, forKey: .contactID)
        duration = container.decodeLossyDouble(forAnyOfKeys: [.duration, .durationSeconds])

        if let iso = try? container.decode(String.self, forKey: .createdAt) {
            createdAt = iso
        } else if let milliseconds = container.decodeLossyDouble(forKey: .createdAt) {
            createdAt = Date(timeIntervalSince1970: milliseconds > 10_000_000_000 ? milliseconds / 1000 : milliseconds).ISO8601Format()
        } else {
            createdAt = nil
        }
    }
}

struct ContactItem: Decodable, Identifiable {
    var id: String { contactID }

    let contactID: String
    let firstName: String?
    let lastName: String?
    let phoneNumber: String?
    let leadStatus: String?
    let email: String?
    let notes: String?
    let source: String?
    let totalCalls: Int?
    let lastContactAt: Double?

    enum CodingKeys: String, CodingKey {
        case contactID = "contact_id"
        case firstName = "first_name"
        case lastName = "last_name"
        case phoneNumber = "phone_number"
        case phone
        case name
        case leadStatus = "lead_status"
        case email
        case notes
        case source
        case totalCalls = "total_calls"
        case lastContactAt = "last_contact_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        contactID = try container.decode(String.self, forKey: .contactID)
        var parsedFirstName = try? container.decode(String.self, forKey: .firstName)
        var parsedLastName = try? container.decode(String.self, forKey: .lastName)
        leadStatus = try? container.decode(String.self, forKey: .leadStatus)
        email = try? container.decode(String.self, forKey: .email)
        notes = try? container.decode(String.self, forKey: .notes)
        source = try? container.decode(String.self, forKey: .source)
        totalCalls = container.decodeLossyInt(forKey: .totalCalls)
        lastContactAt = container.decodeLossyDouble(forKey: .lastContactAt)

        if let normalizedPhone = container.decodeLossyString(forKey: .phoneNumber) {
            phoneNumber = normalizedPhone
        } else {
            phoneNumber = container.decodeLossyString(forKey: .phone)
        }

        if parsedFirstName == nil && parsedLastName == nil, let fullName = try? container.decode(String.self, forKey: .name) {
            let parts = fullName.split(separator: " ", maxSplits: 1, omittingEmptySubsequences: true).map(String.init)
            if let first = parts.first {
                parsedFirstName = first
            }
            if parts.count > 1 {
                parsedLastName = parts[1]
            }
        }
        firstName = parsedFirstName
        lastName = parsedLastName
    }

    var displayName: String {
        let joined = [firstName, lastName].compactMap { $0 }.joined(separator: " ").trimmingCharacters(in: .whitespaces)
        return joined.isEmpty ? (phoneNumber ?? "Unknown") : joined
    }
}

// MARK: - MessageThread

struct MessageThread: Decodable, Identifiable {
    var id: String { contactID }

    let contactID: String
    let contactName: String?
    let contactPhone: String?
    let lastMessage: String?
    let lastAt: String?
    let leadStatus: String?
    let unreadCount: Int?

    enum CodingKeys: String, CodingKey {
        case contactID = "contact_id"
        case contactName = "contact_name"
        case contactPhone = "contact_phone"
        case phone
        case lastMessage = "last_message"
        case lastAt = "last_at"
        case lastMessageAt = "last_message_at"
        case leadStatus = "lead_status"
        case unreadCount = "unread_count"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        contactID = try c.decode(String.self, forKey: .contactID)
        contactName = try? c.decode(String.self, forKey: .contactName)
        contactPhone = c.decodeLossyString(forAnyOfKeys: [.contactPhone, .phone])
        lastMessage = try? c.decode(String.self, forKey: .lastMessage)
        lastAt = c.decodeLossyString(forAnyOfKeys: [.lastAt, .lastMessageAt])
        leadStatus = try? c.decode(String.self, forKey: .leadStatus)
        unreadCount = c.decodeLossyInt(forKey: .unreadCount)
    }

    var displayName: String {
        contactName?.trimmingCharacters(in: .whitespaces).nonEmpty ?? contactPhone ?? "Unknown"
    }

    var lastDate: Date? {
        guard let raw = lastAt else { return nil }
        if let iso = ISO8601DateFormatter().date(from: raw) { return iso }
        if let ms = Double(raw) {
            return Date(timeIntervalSince1970: ms > 10_000_000_000 ? ms / 1000 : ms)
        }
        return nil
    }
}

// MARK: - MessageItem

struct MessageItem: Decodable, Identifiable {
    var id: String { messageID }

    let messageID: String
    let direction: String   // "inbound" | "outbound"
    let body: String
    let sentAt: String?
    let status: String?

    var isOutbound: Bool { direction.lowercased() == "outbound" }

    var sentDate: Date? {
        guard let raw = sentAt else { return nil }
        if let iso = ISO8601DateFormatter().date(from: raw) { return iso }
        if let ms = Double(raw) {
            return Date(timeIntervalSince1970: ms > 10_000_000_000 ? ms / 1000 : ms)
        }
        return nil
    }

    enum CodingKeys: String, CodingKey {
        case messageID = "message_id"
        case id
        case direction
        case body
        case content
        case message
        case sentAt = "sent_at"
        case createdAt = "created_at"
        case timestamp
        case status
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        messageID = c.decodeLossyString(forAnyOfKeys: [.messageID, .id]) ?? UUID().uuidString
        direction = (try? c.decode(String.self, forKey: .direction)) ?? "inbound"
        body = c.decodeLossyString(forAnyOfKeys: [.body, .content, .message]) ?? ""
        sentAt = c.decodeLossyString(forAnyOfKeys: [.sentAt, .createdAt, .timestamp])
        status = try? c.decode(String.self, forKey: .status)
    }
}

// MARK: - KnowledgeItem

struct KnowledgeItem: Decodable, Identifiable {
    var id: String { knowledgeID }

    let knowledgeID: String
    let title: String
    let content: String?
    let type: String?       // FAQ, SERVICE, POLICY, PRODUCT, SAFETY
    let status: String?     // ACTIVE, DRAFT, ARCHIVED
    let tags: [String]?
    let createdAt: String?
    let updatedAt: String?

    enum CodingKeys: String, CodingKey {
        case knowledgeID = "knowledge_id"
        case id
        case title
        case content
        case type
        case status
        case tags
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        knowledgeID = c.decodeLossyString(forAnyOfKeys: [.knowledgeID, .id]) ?? UUID().uuidString
        title = (try? c.decode(String.self, forKey: .title)) ?? "Untitled"
        content = try? c.decode(String.self, forKey: .content)
        type = try? c.decode(String.self, forKey: .type)
        status = try? c.decode(String.self, forKey: .status)
        tags = try? c.decode([String].self, forKey: .tags)
        createdAt = try? c.decode(String.self, forKey: .createdAt)
        updatedAt = try? c.decode(String.self, forKey: .updatedAt)
    }
}

// MARK: - UsageInfo

struct UsageInfo: Decodable {
    let plan: String?
    let periodStart: String?
    let periodEnd: String?
    let callMinutes: UsageMetric?
    let smsMessages: UsageMetric?
    let contacts: UsageMetric?

    struct UsageMetric: Decodable {
        let used: Int
        let limit: Int?

        var fraction: Double {
            guard let limit, limit > 0 else { return 0 }
            return min(1, Double(used) / Double(limit))
        }
    }

    enum CodingKeys: String, CodingKey {
        case plan
        case periodStart = "period_start"
        case periodEnd = "period_end"
        case callMinutes = "call_minutes"
        case smsMessages = "sms_messages"
        case contacts
        case usage
    }

    enum UsageCodingKeys: String, CodingKey {
        case callMinutes = "call_minutes"
        case smsMessages = "sms_messages"
        case contacts
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        plan = try? c.decode(String.self, forKey: .plan)
        periodStart = try? c.decode(String.self, forKey: .periodStart)
        periodEnd = try? c.decode(String.self, forKey: .periodEnd)

        if let nested = try? c.nestedContainer(keyedBy: UsageCodingKeys.self, forKey: .usage) {
            callMinutes = try? nested.decode(UsageMetric.self, forKey: .callMinutes)
            smsMessages = try? nested.decode(UsageMetric.self, forKey: .smsMessages)
            contacts = try? nested.decode(UsageMetric.self, forKey: .contacts)
        } else {
            callMinutes = try? c.decode(UsageMetric.self, forKey: .callMinutes)
            smsMessages = try? c.decode(UsageMetric.self, forKey: .smsMessages)
            contacts = try? c.decode(UsageMetric.self, forKey: .contacts)
        }
    }
}

extension Appointment {
    var scheduledDate: Date? {
        guard let scheduledStart else { return nil }
        return Date(timeIntervalSince1970: scheduledStart > 10_000_000_000 ? scheduledStart / 1000 : scheduledStart)
    }

    var scheduledEndDate: Date? {
        guard let scheduledEnd else { return nil }
        return Date(timeIntervalSince1970: scheduledEnd > 10_000_000_000 ? scheduledEnd / 1000 : scheduledEnd)
    }
}

extension CallItem {
    var createdDate: Date? {
        guard let createdAt else { return nil }
        if let iso = ISO8601DateFormatter().date(from: createdAt) {
            return iso
        }
        if let ms = Double(createdAt) {
            return Date(timeIntervalSince1970: ms > 10_000_000_000 ? ms / 1000 : ms)
        }
        return nil
    }
}

private extension KeyedDecodingContainer {
    func decodeLossyString(forKey key: Key) -> String? {
        if let value = try? decodeIfPresent(String.self, forKey: key) {
            return value
        }
        if let value = try? decodeIfPresent(Int.self, forKey: key) {
            return String(value)
        }
        if let value = try? decodeIfPresent(Double.self, forKey: key) {
            return String(value)
        }
        return nil
    }

    func decodeLossyString(forAnyOfKeys keys: [Key]) -> String? {
        for key in keys {
            if let value = decodeLossyString(forKey: key) {
                return value
            }
        }
        return nil
    }

    func decodeLossyDouble(forKey key: Key) -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: key) {
            return value
        }
        if let value = try? decodeIfPresent(Int.self, forKey: key) {
            return Double(value)
        }
        if let text = try? decodeIfPresent(String.self, forKey: key) {
            return Double(text)
        }
        return nil
    }

    func decodeLossyDouble(forAnyOfKeys keys: [Key]) -> Double? {
        for key in keys {
            if let value = decodeLossyDouble(forKey: key) {
                return value
            }
        }
        return nil
    }

    func decodeLossyInt(forKey key: Key) -> Int? {
        if let value = try? decodeIfPresent(Int.self, forKey: key) {
            return value
        }
        if let value = try? decodeIfPresent(Double.self, forKey: key) {
            return Int(value)
        }
        if let text = try? decodeIfPresent(String.self, forKey: key), let parsed = Int(text) {
            return parsed
        }
        return nil
    }

    func decodeFlexibleDateMilliseconds(forKey key: Key) -> Double? {
        if let ms = decodeLossyDouble(forKey: key) {
            return ms > 10_000_000_000 ? ms : ms * 1000
        }
        guard let text = try? decodeIfPresent(String.self, forKey: key), let value = text.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
            return nil
        }
        if let numeric = Double(value) {
            return numeric > 10_000_000_000 ? numeric : numeric * 1000
        }

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: value) {
            return date.timeIntervalSince1970 * 1000
        }

        let fallbackIso = ISO8601DateFormatter()
        if let date = fallbackIso.date(from: value) {
            return date.timeIntervalSince1970 * 1000
        }
        return nil
    }
}
