import Foundation

struct PairingPayload: Codable {
    let v: Int?
    let token: String
    let port: Int
    let addresses: [String]
    let ws_path: String

    private enum CodingKeys: String, CodingKey {
        case v
        case token
        case port
        case addresses
        case ws_path
    }

    init(v: Int?, token: String, port: Int, addresses: [String], ws_path: String) {
        self.v = v
        self.token = token
        self.port = port
        self.addresses = addresses
        self.ws_path = ws_path
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        v = try? container.decode(Int.self, forKey: .v)
        token = try container.decode(String.self, forKey: .token)
        port = try container.decode(Int.self, forKey: .port)
        addresses = try container.decode([String].self, forKey: .addresses)
        ws_path = (try? container.decode(String.self, forKey: .ws_path)) ?? "/ws"
    }
}

final class MobileGatewayStore: ObservableObject {
    @Published var sessions: [AgentSession]
    @Published var isPaired: Bool
    @Published var pairingPayload: String
    @Published var connectionStatus: String = "Disconnected"
    @Published var errorMessage: String?
    @Published var activeSessionId: UUID?

    private var webSocketTask: URLSessionWebSocketTask?
    private var lastSessionId: UUID?

    init() {
        let defaults = UserDefaults.standard
        pairingPayload = defaults.string(forKey: "lumina_pairing_payload") ?? ""
        isPaired = defaults.bool(forKey: "lumina_paired")
        sessions = sampleSessions
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

    func sendCommand(_ text: String, sessionId: UUID) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        lastSessionId = sessionId
        appendOutgoing(trimmed, sessionId: sessionId)

        let payload: [String: Any] = [
            "type": "command",
            "data": ["task": trimmed]
        ]
        sendJSON(payload)
    }

    func setActiveSession(_ id: UUID?) {
        activeSessionId = id
        if let id, let index = sessions.firstIndex(where: { $0.id == id }) {
            sessions[index].unread = 0
        }
    }

    private func sendPair(token: String) {
        let payload: [String: Any] = [
            "type": "pair",
            "data": ["token": token, "device_name": "iOS"]
        ]
        sendJSON(payload)
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
            handleAgentEvent(data)
            return
        }
    }

    private func handleAgentEvent(_ event: [String: Any]) {
        guard let eventType = event["type"] as? String else { return }
        let text = extractText(from: event)
        guard let text else { return }

        let streamingTypes = ["text_delta", "message_chunk"]
        let finalTypes = ["text_final", "message_final"]

        if streamingTypes.contains(eventType) {
            appendIncoming(text, streaming: true)
        } else if finalTypes.contains(eventType) {
            appendIncoming(text, streaming: false)
        } else if eventType == "error" {
            appendIncoming("Error: \(text)", streaming: false)
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

    private func appendOutgoing(_ text: String, sessionId: UUID) {
        guard let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }
        let message = Message(id: UUID(), text: text, isOutgoing: true, timestamp: Date(), isStreaming: false)
        sessions[index].messages.append(message)
        sessions[index].lastActivity = message.timestamp
    }

    private func appendIncoming(_ text: String, streaming: Bool) {
        guard let sessionId = lastSessionId ?? sessions.first?.id,
              let index = sessions.firstIndex(where: { $0.id == sessionId }) else { return }

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
        if activeSessionId != sessionId {
            sessions[index].unread += 1
        }
    }

    private func parsePairingPayload(_ payload: String) -> PairingPayload? {
        guard let data = payload.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(PairingPayload.self, from: data)
    }
}
