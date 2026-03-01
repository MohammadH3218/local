import SwiftUI
import AVFoundation

@MainActor
final class CallsViewModel: ObservableObject {
    @Published var calls: [CallItem] = []
    @Published var isLoading = false
    @Published var error: String?

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            calls = try await api.getCalls(limit: 100)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

@MainActor
final class CallDetailViewModel: ObservableObject {
    @Published var call: CallItem
    @Published var isLoading = false
    @Published var error: String?

    init(initialCall: CallItem) {
        self.call = initialCall
    }

    func load(using api: APIClient) async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            call = try await api.getCallByID(call.callID)
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Calls List

struct CallsView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel = CallsViewModel()

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
                } else if viewModel.calls.isEmpty {
                    HCEmptyState(
                        icon: "phone.down.waves.left.and.right",
                        title: "No calls yet",
                        message: "Completed and in-progress calls will appear here."
                    )
                } else {
                    List(Array(viewModel.calls.enumerated()), id: \.element.id) { index, call in
                        NavigationLink {
                            CallDetailView(initialCall: call)
                        } label: {
                            CallRow(call: call)
                                .staggeredAppearance(index: index)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .background(HandyCallTheme.pageBackground.ignoresSafeArea())
            .navigationTitle("Calls")
            .task {
                await viewModel.load(using: container.apiClient)
            }
            .refreshable {
                await viewModel.load(using: container.apiClient)
            }
        }
    }
}

// MARK: - Call Row

private struct CallRow: View {
    let call: CallItem

    var body: some View {
        HStack(spacing: 12) {
            AvatarView(name: call.callerName ?? call.callerPhone ?? "?", size: 44)

            VStack(alignment: .leading, spacing: 4) {
                Text(call.callerName ?? call.callerPhone ?? "Unknown")
                    .font(HandyCallTheme.Typography.headline)
                    .foregroundStyle(HandyCallTheme.slate)

                if let createdDate = call.createdDate {
                    Text(createdDate, format: .dateTime.month().day().hour().minute())
                        .font(HandyCallTheme.Typography.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 4) {
                if let status = call.status {
                    StatusBadge(text: status)
                }
                if let duration = call.duration {
                    HStack(spacing: 3) {
                        Image(systemName: "clock")
                            .font(.caption2)
                        Text(formatDuration(duration))
                            .font(.caption2)
                    }
                    .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func formatDuration(_ seconds: Double) -> String {
        let rounded = Int(seconds.rounded())
        let mins = rounded / 60
        let secs = rounded % 60
        return "\(mins)m \(secs)s"
    }
}

// MARK: - Call Detail

private struct CallDetailView: View {
    @EnvironmentObject private var container: AppContainer
    @StateObject private var viewModel: CallDetailViewModel
    @State private var recordingURL: URL?
    @State private var recordingStatusText: String?
    @State private var isResolvingRecording = false

    init(initialCall: CallItem) {
        _viewModel = StateObject(wrappedValue: CallDetailViewModel(initialCall: initialCall))
    }

    var body: some View {
        ScrollView {
            VStack(spacing: HandyCallTheme.Spacing.lg) {
                detailHeader
                overviewCard
                if let transcript = viewModel.call.transcript?.nonEmpty {
                    transcriptCard(transcript)
                }
                RecordingPlaybackCard(
                    recordingURL: recordingURL,
                    isResolving: isResolvingRecording,
                    statusText: recordingStatusText
                )
                if let error = viewModel.error {
                    HCErrorCard(text: error)
                }
            }
            .padding(HandyCallTheme.Spacing.screenPadding)
        }
        .background(HandyCallTheme.pageBackground.ignoresSafeArea())
        .navigationTitle("Call")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .overlay {
            if viewModel.isLoading {
                ProgressView()
            }
        }
        .task { await reload() }
        .refreshable { await reload() }
    }

    private var detailHeader: some View {
        VStack(spacing: 10) {
            AvatarView(name: viewModel.call.callerName ?? "?", size: 64)
            Text(viewModel.call.callerName ?? "Unknown Caller")
                .font(HandyCallTheme.Typography.title)
                .foregroundStyle(HandyCallTheme.slate)
            if let phone = viewModel.call.callerPhone {
                Text(phone)
                    .font(HandyCallTheme.Typography.subhead)
                    .foregroundStyle(.secondary)
            }
            if let status = viewModel.call.status {
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
                    value: viewModel.call.status?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Unknown",
                    icon: "circle.fill",
                    valueColor: HandyCallTheme.statusColor(for: viewModel.call.status)
                )
                Divider().padding(.vertical, 6)
                HCKeyValueRow(title: "Caller", value: viewModel.call.callerName ?? "Unknown", icon: "person.fill")
                Divider().padding(.vertical, 6)
                HCKeyValueRow(title: "Phone", value: viewModel.call.callerPhone ?? "Not provided", icon: "phone.fill")
                if let createdDate = viewModel.call.createdDate {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(title: "Started", value: createdDate.formatted(date: .abbreviated, time: .shortened), icon: "clock.fill")
                }
                if let duration = viewModel.call.duration {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(title: "Duration", value: formatDuration(duration), icon: "timer")
                }
                if let outcome = viewModel.call.outcome?.nonEmpty {
                    Divider().padding(.vertical, 6)
                    HCKeyValueRow(title: "Outcome", value: outcome.replacingOccurrences(of: "_", with: " ").capitalized, icon: "flag.fill")
                }
            }
        }
    }

    private func transcriptCard(_ transcript: String) -> some View {
        let lines = parseTranscript(transcript)

        return SectionCard(title: "Transcript", icon: "text.bubble") {
            ScrollView {
                LazyVStack(spacing: 10) {
                    ForEach(lines) { line in
                        TranscriptBubble(line: line)
                    }
                }
            }
            .frame(minHeight: 120, maxHeight: 360)
        }
    }

    private func reload() async {
        await viewModel.load(using: container.apiClient)
        await resolveRecordingURL()
    }

    private func resolveRecordingURL() async {
        recordingStatusText = nil
        if let existing = viewModel.call.recordingURL?.nonEmpty, let parsed = URL(string: existing) {
            recordingURL = parsed
            return
        }

        isResolvingRecording = true
        defer { isResolvingRecording = false }

        do {
            let fetched = try await container.apiClient.getCallRecordingURL(viewModel.call.callID)
            if let url = URL(string: fetched) {
                recordingURL = url
                return
            }
            recordingStatusText = "Recording URL is invalid."
        } catch {
            recordingURL = nil
            let normalized = error.localizedDescription.lowercased()
            if normalized.contains("not found") {
                recordingStatusText = "Recording is not available yet."
            } else {
                recordingStatusText = error.localizedDescription
            }
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let rounded = Int(seconds.rounded())
        let mins = rounded / 60
        let secs = rounded % 60
        return "\(mins)m \(secs)s"
    }

    private func parseTranscript(_ raw: String) -> [TranscriptLine] {
        let normalized = raw.replacingOccurrences(of: "\r\n", with: "\n")
        let chunks = normalized
            .split(separator: "\n", omittingEmptySubsequences: true)
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        if chunks.isEmpty { return [] }

        return chunks.map { chunk in
            guard let separator = chunk.firstIndex(of: ":") else {
                return TranscriptLine(role: .other, speaker: "Transcript", text: chunk)
            }
            let rawSpeaker = String(chunk[..<separator]).trimmingCharacters(in: .whitespacesAndNewlines)
            let text = String(chunk[chunk.index(after: separator)...]).trimmingCharacters(in: .whitespacesAndNewlines)
            let lowered = rawSpeaker.lowercased()
            if ["assistant", "agent", "bot", "ai"].contains(lowered) {
                return TranscriptLine(role: .assistant, speaker: rawSpeaker.capitalized, text: text)
            }
            if ["caller", "customer", "user", "client"].contains(lowered) {
                return TranscriptLine(role: .caller, speaker: rawSpeaker.capitalized, text: text)
            }
            return TranscriptLine(role: .other, speaker: rawSpeaker, text: text)
        }
    }
}

// MARK: - Transcript Types

private enum TranscriptRole {
    case assistant, caller, other
}

private struct TranscriptLine: Identifiable {
    let id = UUID()
    let role: TranscriptRole
    let speaker: String
    let text: String
}

private struct TranscriptBubble: View {
    let line: TranscriptLine

    var body: some View {
        HStack(alignment: .top) {
            if line.role == .caller { Spacer(minLength: 28) }
            VStack(alignment: .leading, spacing: 5) {
                Text(line.speaker)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Text(line.text)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(10)
            .background(backgroundColor, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            if line.role != .caller { Spacer(minLength: 28) }
        }
    }

    private var backgroundColor: Color {
        switch line.role {
        case .assistant: return HandyCallTheme.emeraldMist
        case .caller: return HandyCallTheme.callerBubble
        case .other: return HandyCallTheme.surfaceGray
        }
    }
}

// MARK: - Recording Playback

private struct RecordingPlaybackCard: View {
    let recordingURL: URL?
    let isResolving: Bool
    let statusText: String?

    @State private var player: AVPlayer?
    @State private var isPlaying = false
    @State private var currentTime: Double = 0
    @State private var duration: Double = 0
    @State private var timeObserver: Any?

    var body: some View {
        SectionCard(title: "Recording", icon: "waveform") {
            if let recordingURL {
                VStack(spacing: 12) {
                    HStack(spacing: 12) {
                        Button {
                            togglePlayPause()
                        } label: {
                            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 16, weight: .bold))
                                .foregroundStyle(.white)
                                .frame(width: 42, height: 42)
                                .background(HandyCallTheme.heroGradient, in: Circle())
                                .cardShadow()
                        }

                        VStack(spacing: 6) {
                            let safeDuration = sanitizedDuration(duration)
                            Slider(
                                value: Binding(
                                    get: { sanitizedCurrentTime(currentTime, maxValue: safeDuration) },
                                    set: { newValue in
                                        let target = sanitizedCurrentTime(newValue, maxValue: safeDuration)
                                        currentTime = target
                                        seek(to: target)
                                    }
                                ),
                                in: 0...max(safeDuration, 0.1)
                            )
                            .tint(HandyCallTheme.emerald)
                            HStack {
                                Text(formatClock(currentTime))
                                Spacer()
                                Text(formatClock(duration))
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    }

                    Link(destination: recordingURL) {
                        Label("Open full recording", systemImage: "arrow.up.forward")
                            .font(.footnote.weight(.semibold))
                    }
                    .foregroundStyle(HandyCallTheme.emeraldDark)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .onAppear { configurePlayer(with: recordingURL) }
                .onChange(of: recordingURL) { _, newValue in configurePlayer(with: newValue) }
                .onDisappear { teardownPlayer() }
            } else if isResolving {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Loading recording...")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text(statusText ?? "Recording is not available yet.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    private func configurePlayer(with url: URL?) {
        guard let url else {
            teardownPlayer()
            return
        }
        teardownPlayer()
        let player = AVPlayer(url: url)
        self.player = player
        duration = sanitizedDuration(player.currentItem?.duration.seconds ?? 0)
        currentTime = 0

        timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.25, preferredTimescale: 600), queue: .main) { time in
            Task { @MainActor in
                currentTime = sanitizedCurrentTime(time.seconds, maxValue: duration)
                let safeDuration = sanitizedDuration(player.currentItem?.duration.seconds ?? 0)
                if safeDuration > 0 {
                    duration = safeDuration
                }
                isPlaying = player.timeControlStatus == .playing
            }
        }
    }

    private func teardownPlayer() {
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
        player?.pause()
        player = nil
        isPlaying = false
    }

    private func togglePlayPause() {
        guard let player else { return }
        if isPlaying {
            player.pause()
            isPlaying = false
        } else {
            player.play()
            isPlaying = true
        }
    }

    private func seek(to seconds: Double) {
        guard let player else { return }
        guard seconds.isFinite else { return }
        player.seek(to: CMTime(seconds: max(0, seconds), preferredTimescale: 600))
    }

    private func formatClock(_ value: Double) -> String {
        guard value.isFinite else { return "0:00" }
        let rounded = Int(value.rounded())
        let mins = rounded / 60
        let secs = rounded % 60
        return "\(mins):\(String(format: "%02d", secs))"
    }

    private func sanitizedDuration(_ value: Double) -> Double {
        if value.isFinite, value > 0 {
            return value
        }
        return 0
    }

    private func sanitizedCurrentTime(_ value: Double, maxValue: Double) -> Double {
        guard value.isFinite else { return 0 }
        return max(0, min(value, max(maxValue, 0.1)))
    }
}
