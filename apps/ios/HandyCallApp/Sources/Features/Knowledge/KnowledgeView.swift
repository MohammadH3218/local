import SwiftUI

// MARK: - View Model

@MainActor
final class KnowledgeViewModel: ObservableObject {
    @Published var items: [KnowledgeItem] = []
    @Published var isLoading = false
    @Published var error: String?
    @Published var selectedFilter: String = "ALL"
    @Published var showAddSheet = false
    @Published var editingItem: KnowledgeItem?
    @Published var deleteTarget: KnowledgeItem?
    @Published var isSaving = false
    @Published var saveError: String?
    @Published var toast: (text: String, style: ToastBanner.ToastStyle)?

    let filters = ["ALL", "FAQ", "SERVICE", "POLICY", "PRODUCT", "SAFETY"]

    var filtered: [KnowledgeItem] {
        if selectedFilter == "ALL" { return items }
        return items.filter { ($0.type ?? "").uppercased() == selectedFilter }
    }

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            items = try await api.getKnowledgeItems()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func delete(item: KnowledgeItem, using api: APIClient) async {
        do {
            try await api.deleteKnowledgeItem(id: item.knowledgeID)
            items.removeAll { $0.knowledgeID == item.knowledgeID }
            toast = ("Item deleted", .info)
        } catch {
            toast = (error.localizedDescription, .error)
        }
    }

    func save(
        id: String?,
        title: String,
        content: String,
        type: String,
        status: String,
        tags: [String],
        using api: APIClient
    ) async {
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            if let id {
                let updated = try await api.updateKnowledgeItem(
                    id: id, title: title, content: content,
                    type: type, status: status, tags: tags
                )
                if let idx = items.firstIndex(where: { $0.knowledgeID == id }) {
                    items[idx] = updated
                }
            } else {
                let created = try await api.createKnowledgeItem(
                    title: title, content: content,
                    type: type, status: status, tags: tags
                )
                items.insert(created, at: 0)
            }
            showAddSheet = false
            editingItem = nil
            toast = (id == nil ? "Item created" : "Changes saved", .success)
        } catch {
            saveError = error.localizedDescription
        }
    }
}

// MARK: - Main View

struct KnowledgeView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel = KnowledgeViewModel()
    @State private var searchText = ""

    private var displayedItems: [KnowledgeItem] {
        let base = viewModel.filtered
        guard !searchText.isEmpty else { return base }
        return base.filter {
            $0.title.localizedCaseInsensitiveContains(searchText) ||
            ($0.content?.localizedCaseInsensitiveContains(searchText) ?? false) ||
            ($0.tags?.joined().localizedCaseInsensitiveContains(searchText) ?? false)
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(0..<6, id: \.self) { _ in
                                KnowledgeRowSkeleton()
                                    .padding(.horizontal, HandyCallTheme.Spacing.screenPadding)
                            }
                        }
                    }
                } else if let error = viewModel.error {
                    HCErrorCard(text: error)
                        .padding(HandyCallTheme.Spacing.screenPadding)
                } else {
                    VStack(spacing: 0) {
                        filterBar
                        Divider()
                        itemList
                    }
                }
            }
            .navigationTitle("Knowledge Base")
            .searchable(text: $searchText, prompt: "Search items")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        viewModel.editingItem = nil
                        viewModel.showAddSheet = true
                    } label: {
                        Image(systemName: "plus")
                            .fontWeight(.semibold)
                            .foregroundStyle(HandyCallTheme.emeraldDark)
                    }
                }
            }
            .task { await viewModel.load(using: container.apiClient) }
            .sheet(isPresented: $viewModel.showAddSheet) {
                KnowledgeFormSheet(viewModel: viewModel, editItem: viewModel.editingItem)
            }
            .overlay(alignment: .top) {
                if let toast = viewModel.toast {
                    ToastBanner(text: toast.text, style: toast.style)
                        .padding(.top, 8)
                        .padding(.horizontal, HandyCallTheme.Spacing.screenPadding)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .onAppear {
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
                                withAnimation { viewModel.toast = nil }
                            }
                        }
                }
            }
            .confirmationDialog(
                "Delete this item?",
                isPresented: Binding(
                    get: { viewModel.deleteTarget != nil },
                    set: { if !$0 { viewModel.deleteTarget = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Delete", role: .destructive) {
                    if let target = viewModel.deleteTarget {
                        Task { await viewModel.delete(item: target, using: container.apiClient) }
                    }
                    viewModel.deleteTarget = nil
                }
                Button("Cancel", role: .cancel) { viewModel.deleteTarget = nil }
            } message: {
                Text("This action cannot be undone.")
            }
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: HandyCallTheme.Spacing.sm) {
                ForEach(viewModel.filters, id: \.self) { filter in
                    FilterChip(
                        label: filter == "ALL" ? "All" : filter.capitalized,
                        isSelected: viewModel.selectedFilter == filter
                    ) {
                        withAnimation(.spring(response: 0.25, dampingFraction: 0.8)) {
                            viewModel.selectedFilter = filter
                        }
                    }
                }
            }
            .padding(.horizontal, HandyCallTheme.Spacing.screenPadding)
            .padding(.vertical, HandyCallTheme.Spacing.md)
        }
        .background(HandyCallTheme.surfaceWhite)
    }

    private var itemList: some View {
        Group {
            if displayedItems.isEmpty {
                HCEmptyState(
                    icon: "brain.head.profile",
                    title: searchText.isEmpty ? "No knowledge items" : "No results",
                    message: searchText.isEmpty
                        ? "Add FAQs, services, and policies to teach your AI."
                        : "Try a different search term."
                )
            } else {
                List(Array(displayedItems.enumerated()), id: \.element.id) { index, item in
                    NavigationLink {
                        KnowledgeDetailView(item: item, viewModel: viewModel)
                    } label: {
                        KnowledgeRow(item: item)
                            .staggeredAppearance(index: index)
                    }
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button(role: .destructive) {
                            viewModel.deleteTarget = item
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                        Button {
                            viewModel.editingItem = item
                            viewModel.showAddSheet = true
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }
                        .tint(HandyCallTheme.info)
                    }
                }
                .listStyle(.plain)
                .refreshable { await viewModel.load(using: container.apiClient) }
            }
        }
    }
}

// MARK: - Filter Chip

private struct FilterChip: View {
    let label: String
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(HandyCallTheme.Typography.footnoteSemibold)
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .foregroundStyle(isSelected ? .white : HandyCallTheme.slate)
                .background(
                    isSelected
                        ? AnyShapeStyle(HandyCallTheme.emeraldDark)
                        : AnyShapeStyle(Color.secondary.opacity(0.1)),
                    in: Capsule()
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Knowledge Row

private struct KnowledgeRow: View {
    let item: KnowledgeItem

    var body: some View {
        HStack(spacing: 12) {
            TypeBadgeCircle(type: item.type ?? "FAQ")

            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(HandyCallTheme.Typography.subhead)
                    .foregroundStyle(HandyCallTheme.slate)
                    .lineLimit(1)

                if let content = item.content, !content.isEmpty {
                    Text(content)
                        .font(HandyCallTheme.Typography.footnote)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                StatusBadge(text: item.status ?? "Active")
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Type Badge Circle

struct TypeBadgeCircle: View {
    let type: String

    private var letter: String {
        String(type.prefix(1)).uppercased()
    }

    private var color: Color {
        switch type.uppercased() {
        case "FAQ":     return HandyCallTheme.info
        case "SERVICE": return HandyCallTheme.emerald
        case "POLICY":  return HandyCallTheme.warning
        case "PRODUCT": return Color.purple
        case "SAFETY":  return HandyCallTheme.destructive
        default:        return .secondary
        }
    }

    var body: some View {
        Text(letter)
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .frame(width: 38, height: 38)
            .background(color.gradient, in: Circle())
    }
}

// MARK: - Knowledge Row Skeleton

private struct KnowledgeRowSkeleton: View {
    var body: some View {
        HStack(spacing: 12) {
            ShimmerView(width: 38, height: 38, cornerRadius: 19)
            VStack(alignment: .leading, spacing: 8) {
                ShimmerView(width: 160, height: 14)
                ShimmerView(height: 12)
            }
            Spacer()
            ShimmerView(width: 55, height: 22, cornerRadius: 11)
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Knowledge Detail View

struct KnowledgeDetailView: View {
    let item: KnowledgeItem
    @ObservedObject var viewModel: KnowledgeViewModel
    @EnvironmentObject private var container: AppContainer

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func formattedDate(_ raw: String?) -> String? {
        guard let raw else { return nil }
        let date = Self.isoFormatter.date(from: raw) ?? ISO8601DateFormatter().date(from: raw)
        guard let date else { return nil }
        return date.formatted(.dateTime.year().month().day())
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.xl) {

                // Header
                VStack(alignment: .leading, spacing: HandyCallTheme.Spacing.sm) {
                    HStack(spacing: HandyCallTheme.Spacing.sm) {
                        TypeBadgeCircle(type: item.type ?? "FAQ")
                        VStack(alignment: .leading, spacing: 2) {
                            Text((item.type ?? "ITEM").capitalized)
                                .font(HandyCallTheme.Typography.caption)
                                .foregroundStyle(.secondary)
                            StatusBadge(text: item.status ?? "Active")
                        }
                        Spacer()
                    }

                    Text(item.title)
                        .font(HandyCallTheme.Typography.title)
                        .foregroundStyle(HandyCallTheme.slate)
                }
                .padding(HandyCallTheme.Spacing.cardPadding)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(HandyCallTheme.surfaceWhite, in: RoundedRectangle(cornerRadius: HandyCallTheme.Radius.card, style: .continuous))
                .cardShadow()

                // Content
                if let content = item.content, !content.isEmpty {
                    SectionCard(title: "Content", icon: "text.alignleft") {
                        Text(content)
                            .font(HandyCallTheme.Typography.body)
                            .foregroundStyle(HandyCallTheme.slate)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }

                // Tags
                if let tags = item.tags, !tags.isEmpty {
                    SectionCard(title: "Tags", icon: "tag.fill") {
                        FlowLayout(spacing: 8) {
                            ForEach(tags, id: \.self) { tag in
                                Text(tag)
                                    .font(HandyCallTheme.Typography.caption)
                                    .padding(.horizontal, 10)
                                    .padding(.vertical, 5)
                                    .background(HandyCallTheme.emeraldLight, in: Capsule())
                                    .foregroundStyle(HandyCallTheme.emeraldDark)
                            }
                        }
                    }
                }

                // Metadata
                SectionCard(title: "Details", icon: "info.circle.fill") {
                    VStack(spacing: HandyCallTheme.Spacing.md) {
                        if let created = formattedDate(item.createdAt) {
                            HCKeyValueRow(title: "Created", value: created, icon: "calendar.badge.plus")
                        }
                        if let updated = formattedDate(item.updatedAt) {
                            HCKeyValueRow(title: "Last Updated", value: updated, icon: "clock.arrow.circlepath")
                        }
                        HCKeyValueRow(title: "Type", value: (item.type ?? "—").capitalized, icon: "square.grid.2x2")
                        HCKeyValueRow(title: "Status", value: (item.status ?? "—").capitalized, icon: "checkmark.seal")
                    }
                }
            }
            .padding(HandyCallTheme.Spacing.screenPadding)
        }
        .background(HandyCallTheme.canvas)
        .navigationTitle("Knowledge Item")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    viewModel.editingItem = item
                    viewModel.showAddSheet = true
                } label: {
                    Text("Edit")
                        .fontWeight(.semibold)
                        .foregroundStyle(HandyCallTheme.emeraldDark)
                }
            }
        }
    }
}

// MARK: - FlowLayout

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var height: CGFloat = 0
        var currentX: CGFloat = 0
        var currentRowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentX + size.width > maxWidth, currentX > 0 {
                height += currentRowHeight + spacing
                currentX = 0
                currentRowHeight = 0
            }
            currentX += size.width + spacing
            currentRowHeight = max(currentRowHeight, size.height)
        }
        height += currentRowHeight
        return CGSize(width: maxWidth, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var currentX = bounds.minX
        var currentY = bounds.minY
        var currentRowHeight: CGFloat = 0

        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if currentX + size.width > bounds.maxX, currentX > bounds.minX {
                currentY += currentRowHeight + spacing
                currentX = bounds.minX
                currentRowHeight = 0
            }
            view.place(at: CGPoint(x: currentX, y: currentY), proposal: .unspecified)
            currentX += size.width + spacing
            currentRowHeight = max(currentRowHeight, size.height)
        }
    }
}

// MARK: - Knowledge Form Sheet

struct KnowledgeFormSheet: View {
    @ObservedObject var viewModel: KnowledgeViewModel
    let editItem: KnowledgeItem?
    @EnvironmentObject private var container: AppContainer
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var content: String
    @State private var type: String
    @State private var status: String
    @State private var tagsText: String

    private let types = ["FAQ", "SERVICE", "POLICY", "PRODUCT", "SAFETY"]
    private let statuses = ["ACTIVE", "DRAFT", "ARCHIVED"]

    init(viewModel: KnowledgeViewModel, editItem: KnowledgeItem?) {
        self.viewModel = viewModel
        self.editItem = editItem
        _title = State(initialValue: editItem?.title ?? "")
        _content = State(initialValue: editItem?.content ?? "")
        _type = State(initialValue: editItem?.type ?? "FAQ")
        _status = State(initialValue: editItem?.status ?? "ACTIVE")
        _tagsText = State(initialValue: editItem?.tags?.joined(separator: ", ") ?? "")
    }

    private var isEditing: Bool { editItem != nil }
    private var isValid: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }
    private var parsedTags: [String] {
        tagsText.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField("e.g. HVAC Emergency Service", text: $title)
                        .submitLabel(.next)
                }

                Section("Type") {
                    Picker("Type", selection: $type) {
                        ForEach(types, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }

                Section("Content") {
                    TextEditor(text: $content)
                        .frame(minHeight: 120)
                        .font(HandyCallTheme.Typography.body)
                }

                Section("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(statuses, id: \.self) { Text($0.capitalized).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
                }

                Section {
                    TextField("pest control, emergency, 24/7", text: $tagsText)
                        .autocorrectionDisabled()
                } header: {
                    Text("Tags")
                } footer: {
                    Text("Separate tags with commas")
                }

                if let saveError = viewModel.saveError {
                    Section {
                        HCErrorCard(text: saveError)
                            .listRowBackground(Color.clear)
                    }
                }
            }
            .navigationTitle(isEditing ? "Edit Item" : "New Item")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Button("Save") {
                            Task {
                                await viewModel.save(
                                    id: editItem?.knowledgeID,
                                    title: title.trimmingCharacters(in: .whitespaces),
                                    content: content,
                                    type: type,
                                    status: status,
                                    tags: parsedTags,
                                    using: container.apiClient
                                )
                            }
                        }
                        .disabled(!isValid)
                        .fontWeight(.semibold)
                    }
                }
            }
        }
    }
}
