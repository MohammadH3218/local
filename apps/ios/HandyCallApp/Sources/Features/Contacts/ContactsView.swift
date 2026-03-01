import SwiftUI

@MainActor
final class ContactsViewModel: ObservableObject {
    @Published var contacts: [ContactItem] = []
    @Published var isLoading = false
    @Published var error: String?

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            contacts = try await api.getContacts(limit: 100)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

@MainActor
final class ContactDetailViewModel: ObservableObject {
    @Published var contact: ContactItem
    @Published var appointments: [Appointment] = []
    @Published var calls: [CallItem] = []
    @Published var isLoading = false
    @Published var error: String?

    init(initialContact: ContactItem) {
        self.contact = initialContact
    }

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            async let detail = api.getContactByID(contact.contactID)
            async let relatedAppointments = api.getContactAppointments(contactID: contact.contactID)
            async let relatedCalls = api.getContactCalls(contactID: contact.contactID, limit: 20)

            contact = try await detail
            appointments = try await relatedAppointments
            calls = try await relatedCalls
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Contacts List

struct ContactsView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel = ContactsViewModel()

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ScrollView {
                        VStack(spacing: 0) {
                            ForEach(0..<6, id: \.self) { _ in
                                ListRowSkeleton()
                                    .padding(.horizontal, HandyCallTheme.Spacing.screenPadding)
                            }
                        }
                    }
                } else if let error = viewModel.error {
                    HCErrorCard(text: error)
                        .padding(HandyCallTheme.Spacing.screenPadding)
                } else if viewModel.contacts.isEmpty {
                    HCEmptyState(
                        icon: "person.crop.circle.badge.plus",
                        title: "No contacts yet",
                        message: "Contacts from calls and manual entries will appear here."
                    )
                } else {
                    List(Array(viewModel.contacts.enumerated()), id: \.element.id) { index, contact in
                        NavigationLink {
                            ContactDetailView(initialContact: contact)
                        } label: {
                            ContactRow(contact: contact)
                                .staggeredAppearance(index: index)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(HandyCallTheme.pageBackground.ignoresSafeArea())
            .navigationTitle("Contacts")
            .task {
                await viewModel.load(using: container.apiClient)
            }
            .refreshable {
                await viewModel.load(using: container.apiClient)
            }
        }
    }
}

// MARK: - Contact Row

private struct ContactRow: View {
    let contact: ContactItem

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(name: contact.displayName, size: 44)

            VStack(alignment: .leading, spacing: 4) {
                Text(contact.displayName)
                    .font(HandyCallTheme.Typography.headline)
                    .foregroundStyle(HandyCallTheme.slate)
                Text(contact.phoneNumber ?? "No phone")
                    .font(HandyCallTheme.Typography.caption)
                    .foregroundStyle(.secondary)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if let status = contact.leadStatus?.nonEmpty {
                    StatusBadge(text: status)
                }
                if let totalCalls = contact.totalCalls, totalCalls > 0 {
                    HStack(spacing: 3) {
                        Image(systemName: "phone")
                            .font(.caption2)
                        Text("\(totalCalls)")
                            .font(.caption2)
                    }
                    .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Contact Detail

private struct ContactDetailView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel: ContactDetailViewModel

    init(initialContact: ContactItem) {
        _viewModel = StateObject(wrappedValue: ContactDetailViewModel(initialContact: initialContact))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: HandyCallTheme.Spacing.lg) {
                contactHeader
                profileCard

                if let notes = viewModel.contact.notes?.nonEmpty {
                    notesCard(notes)
                }

                appointmentsSection
                callsSection

                if let error = viewModel.error {
                    HCErrorCard(text: error)
                }
            }
            .padding(HandyCallTheme.Spacing.screenPadding)
        }
        .background(HandyCallTheme.pageBackground.ignoresSafeArea())
        .navigationTitle(viewModel.contact.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .overlay {
            if viewModel.isLoading {
                ProgressView()
            }
        }
        .task {
            await viewModel.load(using: container.apiClient)
        }
    }

    private var contactHeader: some View {
        VStack(spacing: 10) {
            AvatarView(name: viewModel.contact.displayName, size: 72)
            Text(viewModel.contact.displayName)
                .font(HandyCallTheme.Typography.title)
                .foregroundStyle(HandyCallTheme.slate)
            if let phone = viewModel.contact.phoneNumber {
                Text(phone)
                    .font(HandyCallTheme.Typography.subhead)
                    .foregroundStyle(.secondary)
            }
            if let status = viewModel.contact.leadStatus?.nonEmpty {
                StatusBadge(text: status)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, HandyCallTheme.Spacing.sm)
    }

    private var profileCard: some View {
        SectionCard(title: "Profile", icon: "person.text.rectangle") {
            VStack(spacing: 0) {
                HCKeyValueRow(title: "Name", value: viewModel.contact.displayName, icon: "person.fill")
                Divider().padding(.vertical, 6)
                HCKeyValueRow(title: "Phone", value: viewModel.contact.phoneNumber ?? "Not provided", icon: "phone.fill")
                if let email = viewModel.contact.email?.nonEmpty {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(title: "Email", value: email, icon: "envelope.fill")
                }
                if let source = viewModel.contact.source?.nonEmpty {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(title: "Source", value: source.capitalized, icon: "link")
                }
                if let status = viewModel.contact.leadStatus?.nonEmpty {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(
                        title: "Status",
                        value: status.capitalized,
                        icon: "circle.fill",
                        valueColor: HandyCallTheme.statusColor(for: status)
                    )
                }
            }
        }
    }

    private func notesCard(_ notes: String) -> some View {
        SectionCard(title: "Notes", icon: "note.text") {
            Text(notes)
                .font(HandyCallTheme.Typography.body)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var appointmentsSection: some View {
        SectionCard(title: "Appointments (\(viewModel.appointments.count))", icon: "calendar") {
            if viewModel.appointments.isEmpty {
                Text("No appointments for this contact.")
                    .font(HandyCallTheme.Typography.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(viewModel.appointments.prefix(10).enumerated()), id: \.element.id) { index, appointment in
                        if index > 0 { Divider().padding(.vertical, 6) }
                        HStack(spacing: 10) {
                            Image(systemName: "calendar.badge.clock")
                                .font(.footnote)
                                .foregroundStyle(HandyCallTheme.emerald)
                                .frame(width: 20)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(appointment.serviceType ?? "Service")
                                    .font(.subheadline.weight(.semibold))
                                if let date = appointment.scheduledDate {
                                    Text(date, format: .dateTime.month().day().hour().minute())
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if let status = appointment.status {
                                StatusBadge(text: status)
                            }
                        }
                    }
                }
            }
        }
    }

    private var callsSection: some View {
        SectionCard(title: "Calls (\(viewModel.calls.count))", icon: "phone") {
            if viewModel.calls.isEmpty {
                Text("No calls for this contact.")
                    .font(HandyCallTheme.Typography.footnote)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array(viewModel.calls.prefix(10).enumerated()), id: \.element.id) { index, call in
                        if index > 0 { Divider().padding(.vertical, 6) }
                        HStack(spacing: 10) {
                            Image(systemName: "phone.fill")
                                .font(.footnote)
                                .foregroundStyle(HandyCallTheme.emerald)
                                .frame(width: 20)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(call.status?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Call")
                                    .font(.subheadline.weight(.semibold))
                                if let date = call.createdDate {
                                    Text(date, format: .dateTime.month().day().hour().minute())
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            Spacer()
                            if let status = call.status {
                                StatusBadge(text: status)
                            }
                        }
                    }
                }
            }
        }
    }
}
