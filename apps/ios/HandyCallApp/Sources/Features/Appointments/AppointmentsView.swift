import SwiftUI

@MainActor
final class AppointmentsViewModel: ObservableObject {
    @Published var appointments: [Appointment] = []
    @Published var isLoading = false
    @Published var error: String?

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            let primary = try await api.getAppointments(limit: 100)
            if !primary.isEmpty {
                appointments = primary
                return
            }
            appointments = try await api.getUpcomingAppointments(limit: 30)
        } catch {
            do {
                appointments = try await api.getUpcomingAppointments(limit: 30)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

@MainActor
final class AppointmentDetailViewModel: ObservableObject {
    @Published var appointment: Appointment
    @Published var isLoading = false
    @Published var error: String?

    init(initialAppointment: Appointment) {
        self.appointment = initialAppointment
    }

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }

        do {
            appointment = try await api.getAppointmentByID(appointment.appointmentID)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Appointments List

struct AppointmentsView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel = AppointmentsViewModel()

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
                } else if viewModel.appointments.isEmpty {
                    HCEmptyState(
                        icon: "calendar.badge.exclamationmark",
                        title: "No appointments yet",
                        message: "Scheduled appointments will appear here."
                    )
                } else {
                    List(Array(viewModel.appointments.enumerated()), id: \.element.id) { index, appointment in
                        NavigationLink {
                            AppointmentDetailView(initialAppointment: appointment)
                        } label: {
                            AppointmentRow(appointment: appointment)
                                .staggeredAppearance(index: index)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(HandyCallTheme.pageBackground.ignoresSafeArea())
            .navigationTitle("Appointments")
            .task {
                await viewModel.load(using: container.apiClient)
            }
            .refreshable {
                await viewModel.load(using: container.apiClient)
            }
        }
    }
}

// MARK: - Appointment Row

private struct AppointmentRow: View {
    let appointment: Appointment

    var body: some View {
        HStack(spacing: 12) {
            dateBlock

            VStack(alignment: .leading, spacing: 4) {
                Text(appointment.contactName ?? appointment.contactPhone ?? "Appointment")
                    .font(HandyCallTheme.Typography.headline)
                    .foregroundStyle(HandyCallTheme.slate)
                HStack(spacing: 4) {
                    Image(systemName: "wrench.and.screwdriver")
                        .font(.caption2)
                        .foregroundStyle(HandyCallTheme.emerald)
                    Text(appointment.serviceType ?? "Service")
                        .font(HandyCallTheme.Typography.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            if let status = appointment.status {
                StatusBadge(text: status)
            }
        }
        .padding(.vertical, 4)
    }

    private var dateBlock: some View {
        Group {
            if let date = appointment.scheduledDate {
                VStack(spacing: 2) {
                    Text(date, format: .dateTime.day())
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(HandyCallTheme.emeraldDark)
                    Text(date, format: .dateTime.month(.abbreviated))
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                .frame(width: 48, height: 48)
                .background(HandyCallTheme.emeraldLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            } else {
                Image(systemName: "calendar")
                    .font(.title3)
                    .foregroundStyle(HandyCallTheme.emeraldDark)
                    .frame(width: 48, height: 48)
                    .background(HandyCallTheme.emeraldLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
        }
    }
}

// MARK: - Appointment Detail

private struct AppointmentDetailView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel: AppointmentDetailViewModel

    init(initialAppointment: Appointment) {
        _viewModel = StateObject(wrappedValue: AppointmentDetailViewModel(initialAppointment: initialAppointment))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: HandyCallTheme.Spacing.lg) {
                appointmentHeader
                overviewCard
                contactCard

                if let address = viewModel.appointment.addressText?.nonEmpty {
                    addressCard(address)
                }
                if let notes = viewModel.appointment.notes?.nonEmpty {
                    notesCard(notes)
                }
                if let error = viewModel.error {
                    HCErrorCard(text: error)
                }
            }
            .padding(HandyCallTheme.Spacing.screenPadding)
        }
        .background(HandyCallTheme.pageBackground.ignoresSafeArea())
        .navigationTitle(viewModel.appointment.contactName ?? "Appointment")
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

    private var appointmentHeader: some View {
        VStack(spacing: 10) {
            if let date = viewModel.appointment.scheduledDate {
                VStack(spacing: 2) {
                    Text(date, format: .dateTime.day())
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                        .foregroundStyle(HandyCallTheme.emeraldDark)
                    Text(date, format: .dateTime.month(.wide).year())
                        .font(HandyCallTheme.Typography.subhead)
                        .foregroundStyle(.secondary)
                    Text(date, format: .dateTime.hour().minute())
                        .font(HandyCallTheme.Typography.headline)
                        .foregroundStyle(HandyCallTheme.slate)
                }
            }
            Text(viewModel.appointment.contactName ?? "Appointment")
                .font(HandyCallTheme.Typography.title)
                .foregroundStyle(HandyCallTheme.slate)
            if let status = viewModel.appointment.status {
                StatusBadge(text: status)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, HandyCallTheme.Spacing.sm)
    }

    private var overviewCard: some View {
        SectionCard(title: "Overview", icon: "info.circle") {
            VStack(spacing: 0) {
                HCKeyValueRow(
                    title: "Status",
                    value: viewModel.appointment.status?.capitalized ?? "Unknown",
                    icon: "circle.fill",
                    valueColor: HandyCallTheme.statusColor(for: viewModel.appointment.status)
                )
                Divider().padding(.vertical, 6)
                HCKeyValueRow(title: "Service", value: viewModel.appointment.serviceType ?? "Not set", icon: "wrench.and.screwdriver.fill")
                if let date = viewModel.appointment.scheduledDate {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(title: "Scheduled", value: date.formatted(date: .abbreviated, time: .shortened), icon: "calendar")
                }
                if let endDate = viewModel.appointment.scheduledEndDate {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(title: "Ends", value: endDate.formatted(date: .omitted, time: .shortened), icon: "clock.badge.checkmark")
                }
            }
        }
    }

    private var contactCard: some View {
        SectionCard(title: "Contact", icon: "person") {
            VStack(spacing: 0) {
                HCKeyValueRow(title: "Name", value: viewModel.appointment.contactName ?? "Unknown", icon: "person.fill")
                Divider().padding(.vertical, 6)
                HCKeyValueRow(title: "Phone", value: viewModel.appointment.contactPhone ?? "Not provided", icon: "phone.fill")
                if let email = viewModel.appointment.contactEmail?.nonEmpty {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(title: "Email", value: email, icon: "envelope.fill")
                }
            }
        }
    }

    private func addressCard(_ address: String) -> some View {
        SectionCard(title: "Address", icon: "map.fill") {
            HStack(spacing: 10) {
                Image(systemName: "mappin.circle.fill")
                    .font(.title3)
                    .foregroundStyle(HandyCallTheme.emerald)
                Text(address)
                    .font(HandyCallTheme.Typography.body)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func notesCard(_ notes: String) -> some View {
        SectionCard(title: "Notes", icon: "note.text") {
            Text(notes)
                .font(HandyCallTheme.Typography.body)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
