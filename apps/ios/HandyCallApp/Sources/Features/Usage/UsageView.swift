import SwiftUI

// MARK: - View Model

@MainActor
final class UsageViewModel: ObservableObject {
    @Published var usage: UsageInfo?
    @Published var isLoading = false
    @Published var error: String?

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            usage = try await api.getUsageMetrics()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Usage View

struct UsageView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel = UsageViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: HandyCallTheme.Spacing.xl) {
                    if viewModel.isLoading {
                        usageSkeleton
                    } else if let error = viewModel.error {
                        HCErrorCard(text: error)
                    } else if let usage = viewModel.usage {
                        planCard(usage: usage)
                        metricsSection(usage: usage)
                    } else {
                        HCEmptyState(
                            icon: "chart.bar.xaxis",
                            title: "Usage Unavailable",
                            message: "Unable to load your plan usage. Try refreshing."
                        )
                    }
                }
                .padding(HandyCallTheme.Spacing.screenPadding)
            }
            .background(HandyCallTheme.canvas)
            .navigationTitle("Usage")
            .navigationBarTitleDisplayMode(.large)
            .refreshable { await viewModel.load(using: container.apiClient) }
            .task { await viewModel.load(using: container.apiClient) }
        }
    }

    // MARK: - Plan Card

    private func planCard(usage: UsageInfo) -> some View {
        ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.sm) {
                Text("Current Plan")
                    .font(HandyCallTheme.Typography.caption)
                    .foregroundStyle(.white.opacity(0.75))
                    .textCase(.uppercase)
                    .tracking(1)

                Text(usage.plan?.capitalized ?? "Starter")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                if let start = formattedDate(usage.periodStart), let end = formattedDate(usage.periodEnd) {
                    HStack(spacing: HandyCallTheme.Spacing.xs) {
                        Image(systemName: "calendar")
                            .font(.caption)
                        Text("\(start) – \(end)")
                            .font(HandyCallTheme.Typography.footnote)
                    }
                    .foregroundStyle(.white.opacity(0.8))
                    .padding(.top, 2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(HandyCallTheme.Spacing.xl)
            .background(HandyCallTheme.topGradient, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.xl, style: .continuous))
            .shadow(color: HandyCallTheme.emeraldDark.opacity(0.35), radius: 16, x: 0, y: 8)

            Image(systemName: "star.fill")
                .font(.system(size: 80))
                .foregroundStyle(.white.opacity(0.06))
                .offset(x: 20, y: -20)
        }
    }

    // MARK: - Metrics Section

    private func metricsSection(usage: UsageInfo) -> some View {
        VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.md) {
            Text("This Period")
                .font(HandyCallTheme.Typography.headline)
                .foregroundStyle(.secondary)
                .padding(.leading, 2)

            VStack(spacing: HandyCallTheme.Spacing.md) {
                if let metric = usage.callMinutes {
                    UsageMetricRow(
                        icon: "phone.fill",
                        label: "Call Minutes",
                        metric: metric,
                        color: HandyCallTheme.emerald
                    )
                }
                if let metric = usage.smsMessages {
                    UsageMetricRow(
                        icon: "message.fill",
                        label: "SMS Messages",
                        metric: metric,
                        color: HandyCallTheme.info
                    )
                }
                if let metric = usage.contacts {
                    UsageMetricRow(
                        icon: "person.2.fill",
                        label: "Contacts",
                        metric: metric,
                        color: HandyCallTheme.warning
                    )
                }

                if usage.callMinutes == nil && usage.smsMessages == nil && usage.contacts == nil {
                    HStack {
                        Image(systemName: "info.circle")
                            .foregroundStyle(HandyCallTheme.info)
                        Text("Detailed usage metrics are not available for your current plan.")
                            .font(HandyCallTheme.Typography.footnote)
                            .foregroundStyle(.secondary)
                    }
                    .padding(HandyCallTheme.Spacing.cardPadding)
                    .background(HandyCallTheme.info.opacity(0.06), in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.md, style: .continuous))
                }
            }
            .padding(HandyCallTheme.Spacing.cardPadding)
            .background(HandyCallTheme.surfaceWhite, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous))
            .cardShadow()
        }
    }

    // MARK: - Skeleton

    private var usageSkeleton: some View {
        VStack(spacing: HandyCallTheme.Spacing.xl) {
            ShimmerView(height: 140, cornerRadius: HandyCallTheme.Radius.xl)

            VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.md) {
                ShimmerView(width: 100, height: 16)
                VStack(spacing: HandyCallTheme.Spacing.lg) {
                    ForEach(0..<3, id: \.self) { _ in
                        MetricRowSkeleton()
                    }
                }
                .padding(HandyCallTheme.Spacing.cardPadding)
                .background(HandyCallTheme.surfaceWhite, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous))
            }
        }
    }

    private func formattedDate(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = iso.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
        guard let date else { return nil }
        return date.formatted(.dateTime.month(.abbreviated).day().year())
    }
}

// MARK: - Usage Metric Row

private struct UsageMetricRow: View {
    let icon: String
    let label: String
    let metric: UsageInfo.UsageMetric
    let color: Color

    @State private var animatedFraction: Double = 0

    private var limitText: String {
        if let limit = metric.limit {
            return "\(metric.used) / \(limit)"
        }
        return "\(metric.used) used"
    }

    private var percentText: String {
        guard let limit = metric.limit, limit > 0 else { return "" }
        let pct = Int(metric.fraction * 100)
        return "\(pct)%"
    }

    private var barColor: Color {
        if metric.fraction > 0.9 { return HandyCallTheme.destructive }
        if metric.fraction > 0.75 { return HandyCallTheme.warning }
        return color
    }

    var body: some View {
        VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.sm) {
            HStack {
                HStack(spacing: HandyCallTheme.Spacing.sm) {
                    Image(systemName: icon)
                        .font(.subheadline)
                        .foregroundStyle(color)
                        .frame(width: 20)
                    Text(label)
                        .font(HandyCallTheme.Typography.subhead)
                        .foregroundStyle(HandyCallTheme.slate)
                }
                Spacer()
                HStack(spacing: HandyCallTheme.Spacing.xs) {
                    if !percentText.isEmpty {
                        Text(percentText)
                            .font(HandyCallTheme.Typography.footnoteSemibold)
                            .foregroundStyle(barColor)
                    }
                    Text(limitText)
                        .font(HandyCallTheme.Typography.footnote)
                        .foregroundStyle(.secondary)
                }
            }

            if metric.limit != nil {
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule()
                            .fill(Color.secondary.opacity(0.12))
                            .frame(height: 8)

                        Capsule()
                            .fill(barColor.gradient)
                            .frame(width: max(0, geo.size.width * animatedFraction), height: 8)
                    }
                }
                .frame(height: 8)
                .onAppear {
                    withAnimation(.spring(response: 0.8, dampingFraction: 0.75).delay(0.15)) {
                        animatedFraction = metric.fraction
                    }
                }
            }

            Divider()
                .padding(.top, HandyCallTheme.Spacing.xs)
        }
    }
}

// MARK: - Metric Row Skeleton

private struct MetricRowSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.sm) {
            HStack {
                ShimmerView(width: 120, height: 14)
                Spacer()
                ShimmerView(width: 60, height: 12)
            }
            ShimmerView(height: 8, cornerRadius: 4)
        }
    }
}
