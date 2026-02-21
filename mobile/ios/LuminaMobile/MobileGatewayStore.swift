import Foundation

struct PairingPayload: Codable {
    let v: Int?
    let token: String
    let port: Int
    let addresses: [String]
    let ws_path: String
    let relay_url: String?

    private enum CodingKeys: String, CodingKey {
        case v
        case token
        case port
        case addresses
        case ws_path
        case relay_url
    }

    init(v: Int?, token: String, port: Int, addresses: [String], ws_path: String, relay_url: String?) {
        self.v = v
        self.token = token
        self.port = port
        self.addresses = addresses
        self.ws_path = ws_path
        self.relay_url = relay_url
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        v = try? container.decode(Int.self, forKey: .v)
        token = try container.decode(String.self, forKey: .token)
        port = (try? container.decode(Int.self, forKey: .port)) ?? 0
        addresses = (try? container.decode([String].self, forKey: .addresses)) ?? []
        ws_path = (try? container.decode(String.self, forKey: .ws_path)) ?? "/ws"
        relay_url = try? container.decode(String.self, forKey: .relay_url)
    }
}

final class MobileGatewayStore: ObservableObject {
    @Published var sessions: [AgentSession]
    @Published var isPaired: Bool
    @Published var pairingPayload: String
    @Published var connectionStatus: String = "Disconnected"
    @Published var errorMessage: String?
    @Published var activeSessionId: String?
    @Published var workspaces: [WorkspaceOption] = []
    @Published var agentProfiles: [AgentProfileOption] = []
    @Published var selectedWorkspaceId: String?
    @Published var selectedProfileId: String?
    @Published var fileTree: [MobileFileEntry] = []
    @Published var viewingFileContent: String?
    @Published var viewingFilePath: String?
    @Published var isLoadingFiles: Bool = false
    @Published var isLoadingContent: Bool = false

    private var webSocketTask: URLSessionWebSocketTask?
    private var lastSessionId: String?
    private var pendingSessionCreateTitle: String?

    init() {
        let defaults = UserDefaults.standard
        pairingPayload = defaults.string(forKey: "lumina_pairing_payload") ?? ""
        isPaired = defaults.bool(forKey: "lumina_paired")
        sessions = []
        if isPaired, !pairingPayload.isEmpty {
            connect()
        }
    }

    func applyPairingPayload(_ payload: String) {
        pairingPayload = payload
        let defaults = UserDefaults.standard
        defaults.set(payload, forKey: "lumina_pairing_payload")
        guard parsePairingPayload(payload) != nil else {
            errorMessage = "Invalid payload"
            connectionStatus = "Invalid payload"
            defaults.set(false, forKey: "lumina_paired")
            isPaired = false
            return
        }
        defaults.set(true, forKey: "lumina_paired")
        isPaired = true
        connect()
    }

    func connect() {
        guard let payload = parsePairingPayload(pairingPayload) else {
            connectionStatus = "Invalid payload"
            UserDefaults.standard.set(false, forKey: "lumina_paired")
            isPaired = false
            return
        }
        if let relayUrl = payload.relay_url, !relayUrl.isEmpty {
            let urlString = ensureClientParam(relayUrl, client: "mobile")
            guard let url = URL(string: urlString) else {
                connectionStatus = "Invalid URL"
                return
            }
            var request = URLRequest(url: url)
            request.setValue("Bearer \(payload.token)", forHTTPHeaderField: "Authorization")
            connectionStatus = "Connecting"
            let task = URLSession.shared.webSocketTask(with: request)
            webSocketTask = task
            task.resume()
            sendPair(token: payload.token)
            receiveLoop()
            connectionStatus = "Connected"
            return
        }

        guard let address = payload.addresses.first else {
            connectionStatus = "No address"
            UserDefaults.standard.set(false, forKey: "lumina_paired")
            isPaired = false
            return
        }
        let urlString = "ws://\(address):\(payload.port)\(payload.ws_path)"
        guard let url = URL(string: urlString) else {
            connectionStatus = "Invalid URL"
            return
        }

        connectionStatus = "Connecting"
        let task = URLSession.shared.webSocketTask(with: url)
        webSocketTask = task
        task.resume()
        sendPair(token: payload.token)
        receiveLoop()
        connectionStatus = "Connected"
    }

    func disconnect() {
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        connectionStatus = "Disconnected"
    }

    func resetPairing() {
        disconnect()
        let defaults = UserDefaults.standard
        defaults.set("", forKey: "lumina_pairing_payload")
        defaults.set(false, forKey: "lumina_paired")
        pairingPayload = ""
        isPaired = false
        connectionStatus = "Disconnected"
        errorMessage = nil
        activeSessionId = nil
        sessions = []
        lastSessionId = nil
        pendingSessionCreateTitle = nil
    }

    func sendCommand(_ text: String, sessionId: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        lastSessionId = sessionId
        appendOutgoing(trimmed, sessionId: sessionId)

        let payload: [String: Any] = [
            "type": "command",
            "data": ["task": trimmed, "session_id": sessionId]
        ]
        sendJSON(payload)
    }

    func requestSessionCreate(title: String? = nil) {
        if !ensureConnected() {
            pendingSessionCreateTitle = title
            return
        }
        sendSessionCreate(title: title)
    }

    func setActiveSession(_ id: String?) {
        activeSessionId = id
        if let id, let index = sessions.firstIndex(where: { $0.id == id }) {
            sessions[index].unread = 0
        }
    }

    func requestFileTree(path: String? = nil) {
        isLoadingFiles = true
        var data: [String: Any] = [:]
        if let path {
            data["path"] = path
        }
        let payload: [String: Any] = [
            "type": "list_files",
            "data": data
        ]
        sendJSON(payload)
    }

    func requestFileContent(path: String) {
        isLoadingContent = true
        viewingFilePath = path
        let payload: [String: Any] = [
            "type": "read_file",
            "data": ["path": path]
        ]
        sendJSON(payload)
    }

    private func sendPair(token: String) {
        let payload: [String: Any] = [
            "type": "pair",
            "data": ["token": token, "device_name": "iOS"]
        ]
        sendJSON(payload)
    }

    private func sendSessionCreate(title: String?) {
        var data: [String: Any] = [:]
        if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            data["title"] = title
        }
        let payload: [String: Any] = [
            "type": "session_create",
            "data": data
        ]
        sendJSON(payload)
    }

    private func ensureConnected() -> Bool {
        if webSocketTask != nil && connectionStatus == "Paired" {
            return true
        }
        if webSocketTask != nil && (connectionStatus == "Connecting" || connectionStatus == "Connected") {
            return false
        }
        if !pairingPayload.isEmpty {
            connect()
        } else {
            errorMessage = "Not paired"
        }
        return false
    }

    private func sendJSON(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload, options: []),
              let text = String(data: data, encoding: .utf8) else { return }
        webSocketTask?.send(.string(text)) { error in
            if let error {
                DispatchQueue.main.async {
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func receiveLoop() {
        webSocketTask?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure(let error):
                DispatchQueue.main.async {
                    self.connectionStatus = "Disconnected"
                    self.errorMessage = error.localizedDescription
                }
            case .success(let message):
                switch message {
                case .string(let text):
                    DispatchQueue.main.async {
                        self.handleIncoming(text)
                    }
                case .data(let data):
                    if let text = String(data: data, encoding: .utf8) {
                        DispatchQueue.main.async {
                            self.handleIncoming(text)
                        }
                    }
                @unknown default:
                    break
                }
                self.receiveLoop()
            }
        }
    }

    private func handleIncoming(_ text: String) {
        guard let json = try? JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any] else {
            return
        }
        guard let type = json["type"] as? String else { return }

        if type == "agent_event", let data = json["data"] as? [String: Any] {
            let sessionId = data["session_id"] as? String
            if let event = data["event"] as? [String: Any] {
                handleAgentEvent(event, sessionId: sessionId)
            } else {
                handleAgentEvent(data, sessionId: sessionId)
            }
            return
        }

        if type == "paired" {
            connectionStatus = "Paired"
            if let pendingTitle = pendingSessionCreateTitle {
                pendingSessionCreateTitle = nil
                sendSessionCreate(title: pendingTitle)
            }
            return
        }

        if type == "error" {
            let message = (json["data"] as? [String: Any])?["message"] as? String ?? "Unknown error"
            errorMessage = message
            appendIncoming("Error: \(message)", streaming: false, sessionId: nil)
            return
        }

        if type == "session_list" {
            if let data = json["data"] as? [String: Any],
               let sessionsData = data["sessions"] as? [[String: Any]] {
                applySessionList(sessionsData)
            }
        }

        if type == "options" {
            if let data = json["data"] as? [String: Any] {
                applyOptions(data)
            }
        }

        if type == "file_tree" {
            if let data = json["data"] as? [String: Any],
               let entriesRaw = data["entries"] {
                let decoder = JSONDecoder()
                if let jsonData = try? JSONSerialization.data(withJSONObject: entriesRaw),
                   let entries = try? decoder.decode([MobileFileEntry].self, from: jsonData) {
                    fileTree = entries
                }
            }
            isLoadingFiles = false
            return
        }

        if type == "file_content" {
            if let data = json["data"] as? [String: Any] {
                viewingFileContent = data["content"] as? String
                viewingFilePath = data["path"] as? String
            }
            isLoadingContent = false
            return
        }
    }

    private func handleAgentEvent(_ event: [String: Any], sessionId: String?) {
        guard let eventType = event["type"] as? String else { return }
        let text = extractText(from: event)
        guard let text else { return }

        let streamingTypes = ["text_delta", "message_chunk"]
        let finalTypes = ["text_final", "message_final"]

        if streamingTypes.contains(eventType) {
            appendIncoming(text, streaming: true, sessionId: sessionId)
        } else if finalTypes.contains(eventType) {
            appendIncoming(text, streaming: false, sessionId: sessionId)
        } else if eventType == "error" {
            appendIncoming("Error: \(text)", streaming: false, sessionId: sessionId)
        }
    }

    private func extractText(from event: [String: Any]) -> String? {
        if let data = event["data"] as? [String: Any] {
            if let delta = data["delta"] as? String { return delta }
            if let content = data["content"] as? String { return content }
            if let text = data["text"] as? String { return text }
        }
        if let content = event["content"] as? String { return content }
        return nil
    }

    private func appendOutgoing(_ text: String, sessionId: String) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }
        let message = Message(id: UUID(), text: text, isOutgoing: true, timestamp: Date(), isStreaming: false)
        sessions[index].messages.append(message)
        sessions[index].lastActivity = message.timestamp
    }

    private func appendIncoming(_ text: String, streaming: Bool, sessionId: String?) {
        guard let targetId = sessionId ?? lastSessionId ?? sessions.first?.id,
              let index = sessions.firstIndex(where: { $0.id == targetId }) else { return }

        if streaming {
            if let last = sessions[index].messages.last, !last.isOutgoing, last.isStreaming {
                sessions[index].messages[sessions[index].messages.count - 1].text += text
            } else {
                let message = Message(id: UUID(), text: text, isOutgoing: false, timestamp: Date(), isStreaming: true)
                sessions[index].messages.append(message)
            }
        } else {
            if let last = sessions[index].messages.last, !last.isOutgoing, last.isStreaming {
                sessions[index].messages[sessions[index].messages.count - 1].text = text
                sessions[index].messages[sessions[index].messages.count - 1].isStreaming = false
            } else {
                let message = Message(id: UUID(), text: text, isOutgoing: false, timestamp: Date(), isStreaming: false)
                sessions[index].messages.append(message)
            }
        }

        sessions[index].lastActivity = Date()
        if activeSessionId != targetId {
            sessions[index].unread += 1
        }
    }

    private func parsePairingPayload(_ payload: String) -> PairingPayload? {
        guard let data = payload.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(PairingPayload.self, from: data)
    }

    private func ensureClientParam(_ relayUrl: String, client: String) -> String {
        guard var components = URLComponents(string: relayUrl) else { return relayUrl }
        var items = components.queryItems ?? []
        if !items.contains(where: { $0.name == "client" }) {
            items.append(URLQueryItem(name: "client", value: client))
        }
        components.queryItems = items
        return components.string ?? relayUrl
    }

    private func applySessionList(_ sessionsData: [[String: Any]]) {
        let decoder = JSONDecoder()
        let summaries: [SessionSummary] = sessionsData.compactMap { item in
            guard let data = try? JSONSerialization.data(withJSONObject: item, options: []) else { return nil }
            return try? decoder.decode(SessionSummary.self, from: data)
        }
        let existing = Dictionary(uniqueKeysWithValues: sessions.map { ($0.id, $0) })
        sessions = summaries.map { summary in
            let previous = existing[summary.id]
            let messages = previous?.messages ?? []
            let timestamp = summary.updated_at > 0 ? summary.updated_at : Date().timeIntervalSince1970 * 1000
            return AgentSession(
                id: summary.id,
                name: summary.title,
                isPinned: previous?.isPinned ?? false,
                unread: previous?.unread ?? 0,
                messages: messages,
                lastActivity: Date(timeIntervalSince1970: timestamp / 1000.0),
                lastMessagePreview: summary.last_message_preview,
                lastMessageRole: summary.last_message_role
            )
        }
        if let active = activeSessionId, !sessions.contains(where: { $0.id == active }) {
            activeSessionId = nil
        }
    }

    private func applyOptions(_ data: [String: Any]) {
        let decoder = JSONDecoder()
        if let workspacesData = data["workspaces"] as? [[String: Any]] {
            workspaces = workspacesData.compactMap { item in
                guard let raw = try? JSONSerialization.data(withJSONObject: item, options: []) else { return nil }
                return try? decoder.decode(WorkspaceOption.self, from: raw)
            }
        }
        if let profilesData = data["agent_profiles"] as? [[String: Any]] {
            agentProfiles = profilesData.compactMap { item in
                guard let raw = try? JSONSerialization.data(withJSONObject: item, options: []) else { return nil }
                return try? decoder.decode(AgentProfileOption.self, from: raw)
            }
        }
        selectedWorkspaceId = data["selected_workspace_id"] as? String ?? selectedWorkspaceId
        selectedProfileId = data["selected_profile_id"] as? String ?? selectedProfileId
    }

    func selectWorkspace(id: String) {
        selectedWorkspaceId = id
        let payload: [String: Any] = [
            "type": "select_workspace",
            "data": ["workspace_id": id]
        ]
        sendJSON(payload)
    }

    func selectAgentProfile(id: String) {
        selectedProfileId = id
        let payload: [String: Any] = [
            "type": "select_agent_profile",
            "data": ["profile_id": id]
        ]
        sendJSON(payload)
    }
}

private struct SessionSummary: Codable {
    let id: String
    let title: String
    let session_type: String
    let created_at: Double
    let updated_at: Double
    let last_message_preview: String?
    let last_message_role: String?
    let message_count: Int
}

struct WorkspaceOption: Codable, Identifiable {
    let id: String
    let name: String
    let path: String
}

struct AgentProfileOption: Codable, Identifiable {
    let id: String
    let name: String
    let provider: String
    let model: String
}

struct MobileFileEntry: Identifiable, Codable {
    let name: String
    let relative_path: String
    let is_dir: Bool
    let children: [MobileFileEntry]?

    var id: String { relative_path }
}
