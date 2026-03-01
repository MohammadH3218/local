import SwiftUI

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published var overview: DashboardOverview?
    @Published var isLoading = false
    @Published var error: String?

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            overview = try await api.getDashboardStats()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct DashboardView: View {
    @EnvironmentObject private var container: AppContainer
    @EnvironmentObject private var sessionStore: SessionStore
    @StateObject private var viewModel = DashboardViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: HandyCallTheme.Spacing.lg) {
                    hero

                    if viewModel.isLoading {
                        DashboardSkeleton()
                    } else if let error = viewModel.error {
                        HCErrorCard(text: error)
                    } else if let overview = viewModel.overview {
                        if overview.usageBlocked {
                            limitBanner
                        }
                        statGrid(overview: overview)
                        usageSummary(overview: overview)
                        quickActions(overview: overview)
                        activityFeed(overview: overview)
                    }
                }
                .padding(HandyCallTheme.Spacing.screenPadding)
            }
            .background(HandyCallTheme.pageBackground.ignoresSafeArea())
            .navigationTitle("Dashboard")
            .task {
                await viewModel.load(using: container.apiClient)
            }
            .refreshable {
                await viewModel.load(using: container.apiClient)
            }
        }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 5..<12: return "Good morning"
        case 12..<17: return "Good afternoon"
        default: return "Good evening"
        }
    }

    private var hero: some View {
        ZStack(alignment: .bottomTrailing) {
            VStack(alignment: .leading, spacing: 6) {
                Text(greeting)
                    .font(HandyCallTheme.Typography.subhead)
                    .opacity(0.85)
                Text(sessionStore.company?.companyName ?? "HandyCall")
                    .font(HandyCallTheme.Typography.title)
                Text("Track usage, leads, appointments, and revenue in one place.")
                    .font(.subheadline)
                    .opacity(0.8)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(HandyCallTheme.Spacing.xl)

            Image(systemName: "waveform.path.ecg")
                .font(.system(size: 48))
                .foregroundStyle(.white.opacity(0.12))
                .padding(16)
        }
        .background(HandyCallTheme.heroGradient, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.xl, style: .continuous))
        .elevatedShadow()
    }

    private var limitBanner: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(HandyCallTheme.destructive)
            VStack(alignment: .leading, spacing: 4) {
                Text("Plan limit reached")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HandyCallTheme.destructive)
                Text("AI handling may be paused until your next billing reset.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(HandyCallTheme.Spacing.md)
        .background(HandyCallTheme.destructive.opacity(0.08), in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.md, style: .continuous))
    }

    private func statGrid(overview: DashboardOverview) -> some View {
        let items: [(String, String, String)] = [
            ("Minutes used", "\(Int(overview.usageSummary.minutes.percent.rounded()))%", "clock.fill"),
            ("Active leads", "\(overview.metrics.activeLeads)", "person.badge.plus"),
            ("Appointments", "\(overview.metrics.appointmentsThisWeek)", "calendar.badge.clock"),
            ("Revenue", currency(overview.metrics.revenueThisMonthCents), "dollarsign.circle.fill")
        ]

        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                VStack(alignment: .leading, spacing: 8) {
                    Label {
                        Text(item.0)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } icon: {
                        Image(systemName: item.2)
                            .foregroundStyle(HandyCallTheme.emerald)
                    }
                    Text(item.1)
                        .font(.title3.weight(.bold))
                        .foregroundStyle(HandyCallTheme.slate)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(HandyCallTheme.Spacing.cardPadding)
                .background(HandyCallTheme.surfaceWhite, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous))
                .cardShadow()
            }
        }
    }

    private func usageSummary(overview: DashboardOverview) -> some View {
        VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.md) {
            Text("Usage Summary")
                .font(HandyCallTheme.Typography.headline)
                .foregroundStyle(HandyCallTheme.slate)

            VStack(spacing: 14) {
                UsageBarRow(title: "Call minutes", item: overview.usageSummary.minutes)
                UsageBarRow(title: "SMS", item: overview.usageSummary.sms)
                UsageBarRow(title: "Contacts", item: overview.usageSummary.contacts)
            }
            .padding(HandyCallTheme.Spacing.cardPadding)
            .background(HandyCallTheme.surfaceWhite, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous))
            .cardShadow()
        }
    }

    private func quickActions(overview: DashboardOverview) -> some View {
        VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.md) {
            Text("Quick Actions")
                .font(HandyCallTheme.Typography.headline)
                .foregroundStyle(HandyCallTheme.slate)

            if overview.quickInsights.quickActions.isEmpty {
                Text("No urgent actions right now.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(HandyCallTheme.Spacing.cardPadding)
                    .background(HandyCallTheme.surfaceWhite, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous))
                    .cardShadow()
            } else {
                VStack(spacing: 8) {
                    ForEach(overview.quickInsights.quickActions) { action in
                        HStack(spacing: 10) {
                            Text(action.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(HandyCallTheme.slate)
                                .lineLimit(2)
                            Spacer()
                            Text("\(action.count)")
                                .font(.caption.weight(.bold))
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(HandyCallTheme.emeraldLight, in: Capsule())
                            Text(action.severity)
                                .font(.caption2.weight(.bold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(severityColor(action.severity).opacity(0.14), in: Capsule())
                                .foregroundStyle(severityColor(action.severity))
                        }
                        .padding(HandyCallTheme.Spacing.sm)
                        .background(Color.white, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
                .padding(HandyCallTheme.Spacing.cardPadding)
                .background(HandyCallTheme.surfaceWhite, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous))
                .cardShadow()
            }
        }
    }

    private func activityFeed(overview: DashboardOverview) -> some View {
        VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.md) {
            Text("Activity Feed")
                .font(HandyCallTheme.Typography.headline)
                .foregroundStyle(HandyCallTheme.slate)

            VStack(spacing: 0) {
                ForEach(overview.activityFeed.prefix(15)) { item in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: icon(for: item.type))
                            .foregroundStyle(HandyCallTheme.emerald)
                            .frame(width: 20)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(HandyCallTheme.slate)
                            Text(item.description)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(2)
                            Text(formatTime(item.createdAt))
                                .font(.caption2)
                                .foregroundStyle(.tertiary)
                        }
                        Spacer()
                    }
                    .padding(.vertical, 8)

                    if item.id != overview.activityFeed.prefix(15).last?.id {
                        Divider()
                    }
                }
            }
            .padding(HandyCallTheme.Spacing.cardPadding)
            .background(HandyCallTheme.surfaceWhite, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous))
            .cardShadow()
        }
    }

    private func currency(_ cents: Int) -> String {
        let amount = Double(cents) / 100
        return amount.formatted(.currency(code: "USD"))
    }

    private func formatTime(_ ms: Double) -> String {
        guard ms > 0 else { return "" }
        let date = Date(timeIntervalSince1970: ms > 10_000_000_000 ? ms / 1000 : ms)
        return date.formatted(.dateTime.month(.abbreviated).day().hour().minute())
    }

    private func icon(for type: String) -> String {
        let normalized = type.uppercased()
        switch normalized {
        case "CALL": return "phone.fill"
        case "APPOINTMENT": return "calendar"
        case "PAYMENT": return "creditcard.fill"
        case "LEAD": return "person.badge.plus"
        default: return "bell.fill"
        }
    }

    private func severityColor(_ severity: String) -> Color {
        switch severity.uppercased() {
        case "HIGH": return HandyCallTheme.destructive
        case "MEDIUM": return HandyCallTheme.warning
        default: return HandyCallTheme.info
        }
    }
}

private struct UsageBarRow: View {
    let title: String
    let item: DashboardOverview.UsageItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(HandyCallTheme.slate)
                Spacer()
                Text("\(Int(item.used.rounded())) / \(Int(item.limit.rounded()))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.secondary.opacity(0.12))
                        .frame(height: 8)
                    Capsule()
                        .fill(barColor.gradient)
                        .frame(width: max(0, min(geo.size.width, geo.size.width * (item.percent / 100))), height: 8)
                }
            }
            .frame(height: 8)
        }
    }

    private var barColor: Color {
        if item.blocked { return HandyCallTheme.destructive }
        if item.percent >= 75 { return HandyCallTheme.warning }
        return HandyCallTheme.emerald
    }
}
