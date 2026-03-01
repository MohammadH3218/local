import SwiftUI

@MainActor
final class NotificationPreferencesViewModel: ObservableObject {
    @Published var events: [NotificationEventMeta] = []
    @Published var preferences: [String: NotificationToggle] = [:]
    @Published var isLoading = false
    @Published var isSaving = false
    @Published var error: String?
    @Published var toastMessage: String?

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            async let eventList = api.getNotificationEvents()
            async let prefMap = api.getNotificationPreferences()
            let (loadedEvents, loadedPreferences) = try await (eventList, prefMap)
            events = loadedEvents
            preferences = loadedPreferences
            ensureDefaults()
        } catch {
            self.error = error.localizedDescription
        }
    }

    func save(using api: APIClient) async {
        isSaving = true
        error = nil
        defer { isSaving = false }
        do {
            try await api.updateNotificationPreferences(preferences)
            withAnimation(.easeOut(duration: 0.25)) {
                toastMessage = "Notification settings saved"
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
                withAnimation(.easeIn(duration: 0.2)) {
                    self.toastMessage = nil
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func binding(for eventKey: String, channel: WritableKeyPath<NotificationToggle, Bool>) -> Binding<Bool> {
        Binding(
            get: {
                self.preferences[eventKey]?[keyPath: channel] ?? false
            },
            set: { value in
                var current = self.preferences[eventKey] ?? NotificationToggle(inApp: true, push: true)
                current[keyPath: channel] = value
                self.preferences[eventKey] = current
            }
        )
    }

    private func ensureDefaults() {
        for event in events where preferences[event.eventKey] == nil {
            preferences[event.eventKey] = NotificationToggle(inApp: true, push: true)
        }
    }
}

struct NotificationPreferencesView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel = NotificationPreferencesViewModel()

    private var groupedEvents: [String: [NotificationEventMeta]] {
        Dictionary(grouping: viewModel.events, by: { $0.category })
    }

    var body: some View {
        ZStack(alignment: .top) {
            content
            if let toast = viewModel.toastMessage {
                ToastBanner(text: toast)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .navigationTitle("Notification Settings")
        .task {
            await viewModel.load(using: container.apiClient)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await viewModel.save(using: container.apiClient) }
                } label: {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Text("Save")
                            .fontWeight(.semibold)
                    }
                }
                .disabled(viewModel.isLoading || viewModel.isSaving)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading {
            ProgressView()
        } else if let error = viewModel.error {
            HCErrorCard(text: error)
                .padding(HandyCallTheme.Spacing.screenPadding)
        } else {
            List {
                ForEach(groupedEvents.keys.sorted(), id: \.self) { category in
                    Section(category.capitalized) {
                        ForEach(groupedEvents[category] ?? []) { event in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(spacing: 8) {
                                    Image(systemName: categoryIcon(for: category))
                                        .font(.caption)
                                        .foregroundStyle(HandyCallTheme.emerald)
                                    Text(event.label)
                                        .font(.subheadline.weight(.semibold))
                                }
                                Text(event.description)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)

                                HStack {
                                    Toggle("In-app", isOn: viewModel.binding(for: event.eventKey, channel: \.inApp))
                                        .toggleStyle(.switch)
                                        .tint(HandyCallTheme.emerald)
                                    Toggle("Push", isOn: viewModel.binding(for: event.eventKey, channel: \.push))
                                        .toggleStyle(.switch)
                                        .tint(HandyCallTheme.emerald)
                                }
                                .font(.footnote)
                            }
                            .padding(.vertical, 6)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
        }
    }

    private func categoryIcon(for category: String) -> String {
        let lowered = category.lowercased()
        if lowered.contains("call") { return "phone.fill" }
        if lowered.contains("appointment") || lowered.contains("calendar") { return "calendar" }
        if lowered.contains("lead") || lowered.contains("contact") { return "person.badge.plus" }
        return "bell.fill"
    }
}
