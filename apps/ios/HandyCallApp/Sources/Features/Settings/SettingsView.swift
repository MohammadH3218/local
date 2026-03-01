import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var sessionStore: SessionStore
    @EnvironmentObject private var container: AppContainer

    var body: some View {
        NavigationStack {
            List {
                // Profile header
                Section {
                    profileHeader
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets())
                }

                // Account info
                Section("Account") {
                    HCKeyValueRow(
                        title: "Business",
                        value: sessionStore.company?.companyName ?? "Not loaded",
                        icon: "building.2.fill"
                    )
                    HCKeyValueRow(
                        title: "Email",
                        value: sessionStore.session?.email ?? "Unknown",
                        icon: "envelope.fill"
                    )
                    HCKeyValueRow(
                        title: "Timezone",
                        value: sessionStore.company?.timezone ?? "Not set",
                        icon: "globe"
                    )
                }

                // AI & Content
                Section("AI & Content") {
                    NavigationLink {
                        KnowledgeView()
                            .environmentObject(container)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Knowledge Base")
                                    .foregroundStyle(HandyCallTheme.slate)
                                Text("FAQs, services & policies")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "brain.head.profile")
                                .foregroundStyle(HandyCallTheme.emerald)
                        }
                    }
                }

                // Usage & Plan
                Section("Plan & Usage") {
                    NavigationLink {
                        UsageView()
                            .environmentObject(container)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Usage")
                                    .foregroundStyle(HandyCallTheme.slate)
                                Text("Minutes, messages & contacts")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "chart.bar.fill")
                                .foregroundStyle(HandyCallTheme.info)
                        }
                    }

                    NavigationLink {
                        AutomationSettingsView()
                            .environmentObject(container)
                            .environmentObject(sessionStore)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Automations")
                                    .foregroundStyle(HandyCallTheme.slate)
                                Text("Follow-ups and review requests")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "bolt.badge.clock")
                                .foregroundStyle(HandyCallTheme.emerald)
                        }
                    }
                }

                // Notifications
                Section("Notifications") {
                    NavigationLink {
                        NotificationsView()
                            .environmentObject(container)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Notification Center")
                                    .foregroundStyle(HandyCallTheme.slate)
                                Text("View all alerts & activity")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "bell.fill")
                                .foregroundStyle(HandyCallTheme.warning)
                        }
                    }

                    NavigationLink {
                        NotificationPreferencesView()
                            .environmentObject(container)
                    } label: {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Notification Settings")
                                    .foregroundStyle(HandyCallTheme.slate)
                                Text("In-app & push preferences")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "bell.badge.fill")
                                .foregroundStyle(HandyCallTheme.warning)
                        }
                    }
                }

                // Session
                Section("Session") {
                    Button(role: .destructive) {
                        sessionStore.logout()
                    } label: {
                        Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }

                // About
                Section("About") {
                    HStack {
                        Label("Version", systemImage: "info.circle")
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                            .foregroundStyle(.secondary)
                    }
                    .font(.subheadline)
                }
            }
            .navigationTitle("Settings")
        }
    }

    private var profileHeader: some View {
        VStack(spacing: 14) {
            ZStack(alignment: .bottomTrailing) {
                AvatarView(name: sessionStore.company?.companyName ?? sessionStore.session?.email ?? "U", size: 80)
                Circle()
                    .fill(HandyCallTheme.emerald)
                    .frame(width: 18, height: 18)
                    .overlay(
                        Circle().stroke(HandyCallTheme.surfaceWhite, lineWidth: 3)
                    )
            }

            VStack(spacing: 4) {
                Text(sessionStore.company?.companyName ?? "Your Business")
                    .font(HandyCallTheme.Typography.title3)
                    .foregroundStyle(HandyCallTheme.slate)

                Text(sessionStore.session?.email ?? "")
                    .font(HandyCallTheme.Typography.footnote)
                    .foregroundStyle(.secondary)

                if let serviceType = sessionStore.company?.serviceType, !serviceType.isEmpty {
                    Text(serviceType.capitalized)
                        .font(HandyCallTheme.Typography.caption)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .foregroundStyle(HandyCallTheme.emeraldDark)
                        .background(HandyCallTheme.emeraldLight, in: Capsule())
                        .padding(.top, 2)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, HandyCallTheme.Spacing.xl)
    }
}

@MainActor
private final class AutomationSettingsViewModel: ObservableObject {
    @Published var followUpEnabled = false
    @Published var reviewEnabled = false
    @Published var reviewDelayMinutes = "120"
    @Published var reviewPlatformURL = ""
    @Published var reviewTemplate = ""
    @Published var isSaving = false
    @Published var error: String?
    @Published var successMessage: String?

    func load(from company: Company?) {
        followUpEnabled = company?.followUpSequencesEnabled == true
        reviewEnabled = company?.reviewRequestEnabled == true
        reviewDelayMinutes = String(company?.reviewRequestDelayMinutes ?? 120)
        reviewPlatformURL = company?.reviewPlatformURL ?? ""
        reviewTemplate = company?.reviewRequestTemplate ?? ""
    }

    func save(using api: APIClient, sessionStore: SessionStore) async {
        isSaving = true
        error = nil
        defer { isSaving = false }

        let parsedDelay = max(0, Int(reviewDelayMinutes.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 120)

        do {
            _ = try await api.updateMyCompanyAutomation(
                followUpSequencesEnabled: followUpEnabled,
                reviewRequestEnabled: reviewEnabled,
                reviewRequestDelayMinutes: parsedDelay,
                reviewPlatformURL: reviewPlatformURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : reviewPlatformURL,
                reviewRequestTemplate: reviewTemplate.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : reviewTemplate
            )
            await sessionStore.refreshCompany()
            withAnimation(.easeOut(duration: 0.2)) {
                successMessage = "Automation settings saved"
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
                withAnimation(.easeIn(duration: 0.2)) {
                    self.successMessage = nil
                }
            }
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct AutomationSettingsView: View {
    @EnvironmentObject private var container: AppContainer
    @EnvironmentObject private var sessionStore: SessionStore
    @StateObject private var viewModel = AutomationSettingsViewModel()

    private var isStarterPlan: Bool {
        (sessionStore.company?.subscriptionPlan ?? "").uppercased() == "STARTER"
    }

    var body: some View {
        Form {
            Section("Follow-up sequences") {
                Toggle("Enable follow-up SMS", isOn: $viewModel.followUpEnabled)
                    .disabled(isStarterPlan)

                if isStarterPlan {
                    Text("Follow-up sequences are available on Pro and Max plans.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Sends a sequence after calls when no booking is created.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section("Review requests") {
                Toggle("Enable review requests", isOn: $viewModel.reviewEnabled)

                HStack {
                    Text("Delay (minutes)")
                    Spacer()
                    TextField("120", text: $viewModel.reviewDelayMinutes)
                        .keyboardType(.numberPad)
                        .multilineTextAlignment(.trailing)
                        .frame(width: 90)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Review URL")
                    TextField("https://...", text: $viewModel.reviewPlatformURL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Review message template")
                    TextEditor(text: $viewModel.reviewTemplate)
                        .frame(minHeight: 90)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
                        )
                }
            }

            if let error = viewModel.error {
                Section {
                    HCErrorCard(text: error)
                }
            }

            if let success = viewModel.successMessage {
                Section {
                    Text(success)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(HandyCallTheme.emeraldDark)
                }
            }
        }
        .navigationTitle("Automations")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await viewModel.save(using: container.apiClient, sessionStore: sessionStore) }
                } label: {
                    if viewModel.isSaving {
                        ProgressView()
                    } else {
                        Text("Save").fontWeight(.semibold)
                    }
                }
                .disabled(viewModel.isSaving)
            }
        }
        .onAppear {
            viewModel.load(from: sessionStore.company)
        }
    }
}
