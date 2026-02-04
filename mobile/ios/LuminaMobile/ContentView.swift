import SwiftUI

struct AgentSession: Identifiable, Equatable {
    let id: String
    var name: String
    var isPinned: Bool
    var unread: Int
    var messages: [Message]
    var lastActivity: Date
    var lastMessagePreview: String?
    var lastMessageRole: String?

    var preview: String {
        messages.last?.text ?? lastMessagePreview ?? ""
    }

    var timeLabel: String {
        let calendar = Calendar.current
        if calendar.isDateInToday(lastActivity) {
            return Self.timeFormatter.string(from: lastActivity)
        }
        return Self.dateFormatter.string(from: lastActivity)
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter
    }()

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter
    }()
}

struct Message: Identifiable, Equatable {
    let id: UUID
    var text: String
    var isOutgoing: Bool
    var timestamp: Date
    var isStreaming: Bool

    var timeLabel: String {
        Message.timeFormatter.string(from: timestamp)
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter
    }()
}

struct ContentView: View {
    @StateObject private var store = MobileGatewayStore()

    var body: some View {
        if store.isPaired {
            SessionListView(store: store)
        } else {
            PairingView(store: store)
        }
    }
}

struct PairingView: View {
    @ObservedObject var store: MobileGatewayStore
    @State private var showScanner = false

    var body: some View {
        VStack(spacing: 16) {
            Spacer()
            Image(systemName: "qrcode.viewfinder")
                .font(.system(size: 64))
                .foregroundStyle(.blue)

            Text("Pair with Desktop")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Scan the QR code shown in Lumina Desktop > Settings > Mobile Connect.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            Button(action: { showScanner = true }) {
                Text("Scan QR")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, 32)

            VStack(alignment: .leading, spacing: 8) {
                Text("Or paste pairing payload")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                TextField("{ \"token\": ... }", text: $store.pairingPayload)
                    .textFieldStyle(.roundedBorder)
            }
            .padding(.horizontal, 32)

            Button(action: {
                let trimmed = store.pairingPayload.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty {
                    store.applyPairingPayload(trimmed)
                }
            }) {
                Text("Pair")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
            .padding(.horizontal, 32)
            .disabled(store.pairingPayload.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
            .sheet(isPresented: $showScanner) {
                ZStack(alignment: .topTrailing) {
                    QRScannerContainer { code in
                        store.applyPairingPayload(code)
                        showScanner = false
                    }
                    Button(action: { showScanner = false }) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 28))
                        .foregroundStyle(.white)
                        .padding(16)
                }
            }
            .ignoresSafeArea()
        }
    }
}

struct SessionListView: View {
    @ObservedObject var store: MobileGatewayStore
    @State private var searchText = ""
    @State private var showRePairConfirm = false

    var body: some View {
        NavigationStack {
            List {
                if !store.workspaces.isEmpty {
                    Section("Workspace") {
                        let selected = store.selectedWorkspaceId ?? store.workspaces.first?.id
                        if let selected {
                            Picker("Workspace", selection: Binding(
                                get: { store.selectedWorkspaceId ?? selected },
                                set: { store.selectWorkspace(id: $0) }
                            )) {
                                ForEach(store.workspaces) { workspace in
                                    Text(workspace.name).tag(workspace.id)
                                }
                            }
                            .pickerStyle(.menu)
                        }
                    }
                }

                if !store.agentProfiles.isEmpty {
                    Section("Agent Profile") {
                        let selected = store.selectedProfileId ?? store.agentProfiles.first?.id
                        if let selected {
                            Picker("Agent Profile", selection: Binding(
                                get: { store.selectedProfileId ?? selected },
                                set: { store.selectAgentProfile(id: $0) }
                            )) {
                                ForEach(store.agentProfiles) { profile in
                                    Text(profile.name).tag(profile.id)
                                }
                            }
                            .pickerStyle(.menu)
                        }
                    }
                }

                ForEach(filteredSessions) { session in
                    NavigationLink(value: session.id) {
                        SessionRow(session: session)
                    }
                    .listRowBackground(Color(.secondarySystemGroupedBackground))
                    .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                        Button {
                            togglePin(session.id)
                        } label: {
                            Label(session.isPinned ? "Unpin" : "Pin", systemImage: session.isPinned ? "pin.slash" : "pin")
                        }
                        .tint(session.isPinned ? .gray : .blue)
                    }
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Chats")
            .navigationDestination(for: String.self) { id in
                SessionDetailView(store: store, sessionId: id)
            }
            .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .always))
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Menu {
                        Button("重新配对", role: .destructive) {
                            showRePairConfirm = true
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { store.requestSessionCreate() }) {
                        Image(systemName: "square.and.pencil")
                    }
                    .foregroundStyle(.blue)
                }
            }
            .confirmationDialog("重新配对？", isPresented: $showRePairConfirm, titleVisibility: .visible) {
                Button("重新配对", role: .destructive) {
                    store.resetPairing()
                }
                Button("取消", role: .cancel) {}
            } message: {
                Text("将断开当前连接并返回扫码页面。")
            }
        }
    }

    private var filteredSessions: [AgentSession] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        let visible = query.isEmpty
            ? store.sessions
            : store.sessions.filter { $0.name.localizedCaseInsensitiveContains(query) || $0.preview.localizedCaseInsensitiveContains(query) }
        return visible.sorted { lhs, rhs in
            if lhs.isPinned != rhs.isPinned {
                return lhs.isPinned && !rhs.isPinned
            }
            return lhs.lastActivity > rhs.lastActivity
        }
    }

    private func togglePin(_ id: String) {
        guard let index = store.sessions.firstIndex(where: { $0.id == id }) else { return }
        store.sessions[index].isPinned.toggle()
    }
}

struct SessionRow: View {
    let session: AgentSession

    var body: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(Color(.systemGray4))
                .frame(width: 44, height: 44)
                .overlay(
                    Text(String(session.name.prefix(1)))
                        .font(.headline)
                        .foregroundStyle(.white)
                )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(session.name)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.primary)
                    Spacer()
                    HStack(spacing: 4) {
                        if session.isPinned {
                            Image(systemName: "pin.fill")
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                        }
                        Text(session.timeLabel)
                            .font(.system(size: 12))
                            .foregroundStyle(.secondary)
                    }
                }

                HStack {
                    Text(session.preview)
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer()
                    if session.unread > 0 {
                        Text("\(session.unread)")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(Color.blue))
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }
}

struct SessionDetailView: View {
    @ObservedObject var store: MobileGatewayStore
    let sessionId: String
    @State private var message = ""

    var body: some View {
        Group {
            if let index = store.sessions.firstIndex(where: { $0.id == sessionId }) {
                let session = store.sessions[index]
                VStack(spacing: 0) {
                    ScrollView {
                        LazyVStack(spacing: 8) {
                            ForEach(session.messages) { msg in
                                MessageBubble(message: msg)
                            }
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 16)
                    }
                    .background(Color(.systemGroupedBackground))

                    Divider()

                    HStack(spacing: 8) {
                        TextField("Message", text: $message)
                            .textFieldStyle(.roundedBorder)
                        Button("Send") {
                            sendMessage(sessionId: session.id)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    .padding(12)
                    .background(Color(.secondarySystemBackground))
                }
                .navigationTitle(session.name)
                .navigationBarTitleDisplayMode(.inline)
                .onAppear { store.setActiveSession(session.id) }
                .onDisappear { store.setActiveSession(nil) }
            } else {
                VStack {
                    Text("Session not found")
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    private func sendMessage(sessionId: String) {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        store.sendCommand(trimmed, sessionId: sessionId)
        message = ""
    }
}

struct MessageBubble: View {
    let message: Message

    var body: some View {
        HStack {
            if message.isOutgoing { Spacer() }
            VStack(alignment: .leading, spacing: 4) {
                MarkdownMessageText(text: message.text, isOutgoing: message.isOutgoing)
                Text(message.timeLabel)
                    .font(.system(size: 11))
                    .foregroundStyle(message.isOutgoing ? .white.opacity(0.8) : .secondary)
            }
            .padding(10)
            .background(message.isOutgoing ? Color.blue : Color(.secondarySystemBackground))
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            if !message.isOutgoing { Spacer() }
        }
        .padding(message.isOutgoing ? .leading : .trailing, 40)
    }
}

struct MarkdownMessageText: View {
    let text: String
    let isOutgoing: Bool

    var body: some View {
        if let attributed = try? AttributedString(markdown: text) {
            Text(attributed)
                .font(.system(size: 15))
                .foregroundStyle(isOutgoing ? .white : .primary)
                .tint(isOutgoing ? .white : .blue)
        } else {
            Text(text)
                .font(.system(size: 15))
                .foregroundStyle(isOutgoing ? .white : .primary)
        }
    }
}

#Preview {
    ContentView()
}
