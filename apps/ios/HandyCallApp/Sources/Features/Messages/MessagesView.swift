import SwiftUI

// MARK: - View Models

@MainActor
final class MessagesViewModel: ObservableObject {
    @Published var threads: [MessageThread] = []
    @Published var isLoading = false
    @Published var error: String?

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            threads = try await api.getMessageThreads(limit: 100)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

@MainActor
final class MessageThreadViewModel: ObservableObject {
    @Published var messages: [MessageItem] = []
    @Published var isLoading = false
    @Published var error: String?

    let thread: MessageThread

    init(thread: MessageThread) {
        self.thread = thread
    }

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            messages = try await api.getMessageThread(contactID: thread.contactID)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Thread List

struct MessagesView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel = MessagesViewModel()
    @State private var searchText = ""

    private var filtered: [MessageThread] {
        guard !searchText.isEmpty else { return viewModel.threads }
        return viewModel.threads.filter {
            $0.displayName.localizedCaseInsensitiveContains(searchText) ||
            ($0.lastMessage?.localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(0..<8, id: \.self) { _ in
                                MessageThreadSkeleton()
                                    .padding(.horizontal, HandyCallTheme.Spacing.screenPadding)
                            }
                        }
                    }
                } else if let error = viewModel.error {
                    HCErrorCard(text: error)
                        .padding(HandyCallTheme.Spacing.screenPadding)
                } else if filtered.isEmpty {
                    HCEmptyState(
                        icon: "message.fill",
                        title: searchText.isEmpty ? "No messages yet" : "No results",
                        message: searchText.isEmpty
                            ? "SMS conversations with your contacts appear here."
                            : "Try searching for a different name or message."
                    )
                } else {
                    List(Array(filtered.enumerated()), id: \.element.id) { index, thread in
                        NavigationLink {
                            MessageThreadView(thread: thread)
                        } label: {
                            MessageThreadRow(thread: thread)
                                .staggeredAppearance(index: index)
                        }
                        .listRowBackground(
                            (thread.unreadCount ?? 0) > 0
                                ? HandyCallTheme.emeraldMist.opacity(0.6)
                                : Color.clear
                        )
                    }
                    .listStyle(.plain)
                    .refreshable { await viewModel.load(using: container.apiClient) }
                }
            }
            .navigationTitle("Messages")
            .searchable(text: $searchText, prompt: "Search conversations")
            .task { await viewModel.load(using: container.apiClient) }
        }
    }
}

// MARK: - Thread Row

private struct MessageThreadRow: View {
    let thread: MessageThread

    private var timeLabel: String {
        guard let date = thread.lastDate else { return "" }
        let cal = Calendar.current
        if cal.isDateInToday(date) {
            return date.formatted(.dateTime.hour().minute())
        } else if cal.isDateInYesterday(date) {
            return "Yesterday"
        } else {
            return date.formatted(.dateTime.month(.abbreviated).day())
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(name: thread.displayName, size: 50)
                if (thread.unreadCount ?? 0) > 0 {
                    Circle()
                        .fill(HandyCallTheme.emerald)
                        .frame(width: 12, height: 12)
                        .overlay(Circle().stroke(HandyCallTheme.surfaceWhite, lineWidth: 1.5))
                }
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(thread.displayName)
                        .font((thread.unreadCount ?? 0) > 0
                              ? HandyCallTheme.Typography.headline
                              : HandyCallTheme.Typography.subhead)
                        .foregroundStyle(HandyCallTheme.slate)
                        .lineLimit(1)
                    Spacer()
                    Text(timeLabel)
                        .font(HandyCallTheme.Typography.caption)
                        .foregroundStyle(.secondary)
                }

                HStack {
                    if let preview = thread.lastMessage {
                        Text(preview)
                            .font(HandyCallTheme.Typography.footnote)
                            .foregroundStyle((thread.unreadCount ?? 0) > 0 ? HandyCallTheme.slate : .secondary)
                            .fontWeight((thread.unreadCount ?? 0) > 0 ? .medium : .regular)
                            .lineLimit(2)
                    }
                    Spacer(minLength: 8)
                    if let status = thread.leadStatus {
                        StatusBadge(text: status)
                    }
                }
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Thread Skeleton

private struct MessageThreadSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            ShimmerView(width: 50, height: 50, cornerRadius: 25)
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    ShimmerView(width: 120, height: 14)
                    Spacer()
                    ShimmerView(width: 40, height: 11)
                }
                ShimmerView(height: 12)
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Thread Conversation View

struct MessageThreadView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel: MessageThreadViewModel

    init(thread: MessageThread) {
        _viewModel = StateObject(wrappedValue: MessageThreadViewModel(thread: thread))
    }

    var body: some View {
        Group {
            if viewModel.isLoading {
                VStack {
                    ProgressView()
                    Text("Loading conversation…")
                        .font(HandyCallTheme.Typography.footnote)
                        .foregroundStyle(.secondary)
                        .padding(.top, 8)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error = viewModel.error {
                HCErrorCard(text: error)
                    .padding(HandyCallTheme.Spacing.screenPadding)
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            } else if viewModel.messages.isEmpty {
                HCEmptyState(
                    icon: "bubble.left.and.bubble.right",
                    title: "No messages",
                    message: "This conversation has no messages yet."
                )
            } else {
                conversationBody
            }
        }
        .navigationTitle(viewModel.thread.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if let phone = viewModel.thread.contactPhone, !phone.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        if let url = URL(string: "tel://\(phone.filter { $0.isNumber })") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        Image(systemName: "phone.fill")
                            .foregroundStyle(HandyCallTheme.emerald)
                    }
                }
            }
        }
        .task { await viewModel.load(using: container.apiClient) }
    }

    private var conversationBody: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0) {
                    let grouped = groupedByDay(viewModel.messages)
                    ForEach(grouped, id: \.0) { day, msgs in
                        DayDivider(date: day)
                        ForEach(msgs) { msg in
                            MessageBubble(message: msg)
                                .id(msg.id)
                        }
                    }
                }
                .padding(.horizontal, HandyCallTheme.Spacing.screenPadding)
                .padding(.vertical, HandyCallTheme.Spacing.md)
            }
            .background(HandyCallTheme.canvas)
            .onAppear {
                if let last = viewModel.messages.last {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
        }
    }

    private func groupedByDay(_ messages: [MessageItem]) -> [(Date, [MessageItem])] {
        let cal = Calendar.current
        let grouped = Dictionary(grouping: messages) { msg -> Date in
            guard let date = msg.sentDate else { return Date.distantPast }
            return cal.startOfDay(for: date)
        }
        return grouped.sorted { $0.key < $1.key }
    }
}

// MARK: - Day Divider

private struct DayDivider: View {
    let date: Date

    private var label: String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "Today" }
        if cal.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.weekday(.wide).month().day())
    }

    var body: some View {
        HStack {
            Rectangle().frame(height: 0.5).foregroundStyle(Color.secondary.opacity(0.3))
            Text(label)
                .font(HandyCallTheme.Typography.caption)
                .foregroundStyle(.secondary)
                .fixedSize()
            Rectangle().frame(height: 0.5).foregroundStyle(Color.secondary.opacity(0.3))
        }
        .padding(.vertical, HandyCallTheme.Spacing.md)
    }
}

// MARK: - Message Bubble

private struct MessageBubble: View {
    let message: MessageItem

    var body: some View {
        VStack(alignment: message.isOutbound ? .trailing : .leading, spacing: 2) {
            HStack {
                if message.isOutbound { Spacer(minLength: 60) }

                VStack(alignment: message.isOutbound ? .trailing : .leading, spacing: 4) {
                    Text(message.body)
                        .font(HandyCallTheme.Typography.body)
                        .foregroundStyle(message.isOutbound ? .white : HandyCallTheme.slate)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .background(
                            message.isOutbound
                                ? AnyShapeStyle(HandyCallTheme.topGradient)
                                : AnyShapeStyle(HandyCallTheme.surfaceWhite),
                            in: BubbleShape(isOutbound: message.isOutbound)
                        )
                        .shadow(
                            color: message.isOutbound
                                ? HandyCallTheme.emeraldDark.opacity(0.25)
                                : Color.black.opacity(0.06),
                            radius: 4, x: 0, y: 2
                        )

                    if let date = message.sentDate {
                        Text(date.formatted(.dateTime.hour().minute()))
                            .font(HandyCallTheme.Typography.caption2)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 4)
                    }
                }

                if !message.isOutbound { Spacer(minLength: 60) }
            }
        }
        .padding(.vertical, 3)
    }
}

// MARK: - Bubble Shape

private struct BubbleShape: Shape {
    let isOutbound: Bool
    let radius: CGFloat = 18
    let tail: CGFloat = 8

    func path(in rect: CGRect) -> Path {
        var path = Path()
        if isOutbound {
            path.addRoundedRect(
                in: CGRect(x: rect.minX, y: rect.minY, width: rect.width - tail, height: rect.height),
                cornerSize: CGSize(width: radius, height: radius),
                style: .continuous
            )
        } else {
            path.addRoundedRect(
                in: CGRect(x: rect.minX + tail, y: rect.minY, width: rect.width - tail, height: rect.height),
                cornerSize: CGSize(width: radius, height: radius),
                style: .continuous
            )
        }
        return path
    }
}
