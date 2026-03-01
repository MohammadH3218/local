import SwiftUI

@MainActor
final class NotificationsViewModel: ObservableObject {
    @Published var notifications: [NotificationItem] = []
    @Published var unreadCount: Int = 0
    @Published var isLoading = false
    @Published var error: String?
    @Published var showUnreadOnly = false

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            async let feed = api.getNotifications(limit: 100, unreadOnly: showUnreadOnly)
            async let unread = api.getUnreadNotificationCount()
            let (items, count) = try await (feed, unread)
            notifications = items
            unreadCount = count
        } catch {
            self.error = error.localizedDescription
        }
    }

    func markRead(_ item: NotificationItem, using api: APIClient) async {
        guard item.isRead == false else { return }
        do {
            try await api.markNotificationRead(notificationID: item.notificationID)
            await load(using: api)
        } catch {
            self.error = error.localizedDescription
        }
    }

    func markAllRead(using api: APIClient) async {
        do {
            try await api.markAllNotificationsRead()
            await load(using: api)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

struct NotificationsView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel = NotificationsViewModel()
    @State private var selectedCategory = "ALL"

    private var categories: [String] {
        let unique = Set(viewModel.notifications.map { $0.category.uppercased() })
        return ["ALL"] + unique.sorted()
    }

    private var filteredNotifications: [NotificationItem] {
        guard selectedCategory != "ALL" else { return viewModel.notifications }
        return viewModel.notifications.filter { $0.category.uppercased() == selectedCategory }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                filterHeader
                content
            }
            .background(HandyCallTheme.pageBackground.ignoresSafeArea())
            .navigationTitle("Notifications")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Read all") {
                        Task { await viewModel.markAllRead(using: container.apiClient) }
                    }
                    .disabled(viewModel.unreadCount == 0)
                }
            }
            .task {
                await viewModel.load(using: container.apiClient)
            }
            .refreshable {
                await viewModel.load(using: container.apiClient)
            }
        }
    }

    private var filterHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                HStack(spacing: 6) {
                    Image(systemName: "envelope.badge")
                        .font(.caption)
                        .foregroundStyle(HandyCallTheme.emerald)
                    Text("Unread")
                        .font(HandyCallTheme.Typography.footnoteSemibold)
                        .foregroundStyle(HandyCallTheme.slate)
                    Text("\(viewModel.unreadCount)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(HandyCallTheme.emeraldDark)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2)
                        .background(HandyCallTheme.emeraldLight, in: Capsule())
                }
                Spacer()
                Toggle("Unread only", isOn: $viewModel.showUnreadOnly)
                    .labelsHidden()
                    .tint(HandyCallTheme.emerald)
                    .onChange(of: viewModel.showUnreadOnly) {
                        Task { await viewModel.load(using: container.apiClient) }
                    }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(categories, id: \.self) { category in
                        Button {
                            selectedCategory = category
                        } label: {
                            Text(category == "ALL" ? "All" : category.capitalized)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(selectedCategory == category ? Color.white : HandyCallTheme.slate)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(
                                    selectedCategory == category
                                        ? HandyCallTheme.emerald
                                        : HandyCallTheme.surfaceWhite,
                                    in: Capsule()
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .padding(.horizontal, HandyCallTheme.Spacing.screenPadding)
        .padding(.vertical, 10)
        .background(HandyCallTheme.surfaceWhite)
        .subtleShadow()
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            Spacer()
            ProgressView()
            Spacer()
        } else if let error = viewModel.error {
            HCErrorCard(text: error)
                .padding(HandyCallTheme.Spacing.screenPadding)
            Spacer()
        } else if viewModel.notifications.isEmpty {
            HCEmptyState(
                icon: "bell.slash",
                title: "All caught up",
                message: "New notifications will appear here."
            )
        } else if filteredNotifications.isEmpty {
            HCEmptyState(
                icon: "line.3.horizontal.decrease.circle",
                title: "No notifications in this category",
                message: "Try another category or switch off filters."
            )
        } else {
            List(Array(filteredNotifications.enumerated()), id: \.element.id) { index, item in
                Button {
                    Task { await viewModel.markRead(item, using: container.apiClient) }
                } label: {
                    NotificationRow(item: item)
                        .staggeredAppearance(index: index)
                }
                .buttonStyle(.plain)
                .listRowBackground(item.isRead ? Color.clear : HandyCallTheme.emeraldLight.opacity(0.3))
            }
            .listStyle(.plain)
        }
    }
}

// MARK: - Notification Row

private struct NotificationRow: View {
    let item: NotificationItem

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            categoryIcon
            Circle()
                .fill(item.isRead ? Color.clear : HandyCallTheme.emerald)
                .frame(width: 8, height: 8)
                .padding(.top, 6)

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
                Text(item.body)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Text(Date(timeIntervalSince1970: item.createdAt / 1000), format: .dateTime.month().day().hour().minute())
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }

    private var categoryIcon: some View {
        let (icon, color) = categoryIconAndColor(for: item.category)
        return Image(systemName: icon)
            .font(.caption)
            .foregroundStyle(.white)
            .frame(width: 28, height: 28)
            .background(color, in: Circle())
    }

    private func categoryIconAndColor(for category: String) -> (String, Color) {
        let lowered = category.lowercased()
        if lowered.contains("call") {
            return ("phone.fill", HandyCallTheme.emerald)
        } else if lowered.contains("appointment") || lowered.contains("calendar") {
            return ("calendar", HandyCallTheme.info)
        } else if lowered.contains("lead") || lowered.contains("contact") {
            return ("person.badge.plus", HandyCallTheme.warning)
        } else {
            return ("bell.fill", Color.gray)
        }
    }
}
