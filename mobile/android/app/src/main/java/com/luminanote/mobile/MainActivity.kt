@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)

package com.luminanote.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.method.LinkMovementMethod
import android.util.TypedValue
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.border
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import io.noties.markwon.Markwon
import io.noties.markwon.linkify.LinkifyPlugin
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter

private data class Message(
    val id: String = UUID.randomUUID().toString(),
    val text: String,
    val isOutgoing: Boolean,
    val timeLabel: String,
    val isStreaming: Boolean
)

private data class AgentSession(
    val id: String = UUID.randomUUID().toString(),
    val name: String,
    val isPinned: Boolean,
    val unread: Int,
    val messages: List<Message>,
    val updatedAt: Long,
    val createdAt: Long,
    val lastMessagePreview: String?,
    val lastMessageRole: String?
)

private data class PairingPayload(
    val token: String,
    val port: Int,
    val addresses: List<String>,
    val wsPath: String
)

private data class SessionSummary(
    val id: String,
    val title: String,
    val sessionType: String,
    val createdAt: Long,
    val updatedAt: Long,
    val lastMessagePreview: String?,
    val lastMessageRole: String?,
    val messageCount: Int
)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    LuminaMobileApp()
                }
            }
        }
    }
}

@Composable
fun LuminaMobileApp() {
    val context = LocalContext.current
    val store = remember { MobileGatewayStore(context) }

    if (!store.isPaired) {
        PairingScreen(store = store)
        return
    }

    if (store.activeSessionId == null) {
        ChatListScreen(store = store)
    } else {
        val index = store.sessions.indexOfFirst { it.id == store.activeSessionId }
        if (index == -1) {
            store.activeSessionId = null
        } else {
            ChatDetailScreen(store = store, sessionIndex = index)
        }
    }
}

private class MobileGatewayStore(private val context: Context) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val okHttp = OkHttpClient()
    private var webSocket: WebSocket? = null

    var isPaired by mutableStateOf(PairingPrefs.isPaired(context))
    var pairingPayload by mutableStateOf(PairingPrefs.getPayload(context))
    var connectionStatus by mutableStateOf("Disconnected")
    var errorMessage by mutableStateOf<String?>(null)
    var activeSessionId by mutableStateOf<String?>(null)
    val sessions = mutableStateListOf<AgentSession>()

    private var lastSessionId: String? = null
    private var pendingSessionCreateTitle: String? = null

    init {
        if (isPaired && pairingPayload.isNotBlank()) {
            connect()
        }
    }

    fun applyPairing(payload: String) {
        pairingPayload = payload
        PairingPrefs.setPayload(context, payload)
        if (parsePairingPayload(payload) == null) {
            errorMessage = "Invalid payload"
            connectionStatus = "Invalid payload"
            PairingPrefs.setPaired(context, false)
            isPaired = false
            return
        }
        PairingPrefs.setPaired(context, true)
        isPaired = true
        connect()
    }

    fun connect() {
        val parsed = parsePairingPayload(pairingPayload) ?: run {
            connectionStatus = "Invalid payload"
            PairingPrefs.setPaired(context, false)
            isPaired = false
            return
        }
        val address = parsed.addresses.firstOrNull() ?: run {
            connectionStatus = "No address"
            PairingPrefs.setPaired(context, false)
            isPaired = false
            return
        }
        val url = "ws://$address:${parsed.port}${parsed.wsPath}"
        connectionStatus = "Connecting"
        val request = Request.Builder().url(url).build()
        webSocket = okHttp.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                sendPair(parsed.token)
                postStatus("Connected")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                mainHandler.post { handleIncoming(text) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                postStatus("Disconnected")
                postError(t.message)
            }
        })
    }

    fun resetPairing() {
        webSocket?.close(1000, "reset")
        webSocket = null
        PairingPrefs.setPaired(context, false)
        PairingPrefs.setPayload(context, "")
        isPaired = false
        pairingPayload = ""
        connectionStatus = "Disconnected"
        errorMessage = null
        activeSessionId = null
        sessions.clear()
        lastSessionId = null
        pendingSessionCreateTitle = null
    }

    fun sendCommand(text: String, sessionId: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return
        lastSessionId = sessionId
        appendOutgoing(trimmed, sessionId)
        val payload = JSONObject()
            .put("type", "command")
            .put("data", JSONObject().put("task", trimmed).put("session_id", sessionId))
        webSocket?.send(payload.toString())
    }

    fun requestSessionCreate(title: String? = null) {
        if (!ensureConnected()) {
            pendingSessionCreateTitle = title
            return
        }
        sendSessionCreate(title)
    }

    fun setActiveSession(id: String?) {
        activeSessionId = id
        if (id != null) {
            val index = sessions.indexOfFirst { it.id == id }
            if (index != -1) {
                val session = sessions[index]
                sessions[index] = session.copy(unread = 0)
            }
        }
    }

    private fun sendPair(token: String) {
        val payload = JSONObject()
            .put("type", "pair")
            .put("data", JSONObject().put("token", token).put("device_name", "Android"))
        webSocket?.send(payload.toString())
    }

    private fun sendSessionCreate(title: String?) {
        val data = JSONObject()
        if (!title.isNullOrBlank()) {
            data.put("title", title)
        }
        val payload = JSONObject()
            .put("type", "session_create")
            .put("data", data)
        webSocket?.send(payload.toString())
    }

    private fun ensureConnected(): Boolean {
        if (webSocket != null && connectionStatus == "Paired") {
            return true
        }
        if (webSocket != null && (connectionStatus == "Connecting" || connectionStatus == "Connected")) {
            return false
        }
        if (pairingPayload.isNotBlank()) {
            connect()
        } else {
            errorMessage = "Not paired"
        }
        return false
    }

    private fun handleIncoming(text: String) {
        try {
            val json = JSONObject(text)
            val type = json.optString("type")
            if (type == "agent_event") {
                val data = json.optJSONObject("data") ?: return
                val sessionId = data.optString("session_id").takeIf { it.isNotBlank() }
                val event = data.optJSONObject("event") ?: data
                handleAgentEvent(event, sessionId)
            } else if (type == "paired") {
                connectionStatus = "Paired"
                pendingSessionCreateTitle?.let { title ->
                    pendingSessionCreateTitle = null
                    sendSessionCreate(title)
                }
            } else if (type == "error") {
                val message = json.optJSONObject("data")?.optString("message") ?: "Unknown error"
                errorMessage = message
                appendIncoming("Error: $message", streaming = false, sessionId = null)
            } else if (type == "session_list") {
                val data = json.optJSONObject("data") ?: return
                val list = data.optJSONArray("sessions") ?: JSONArray()
                applySessionList(list)
            }
        } catch (_: Exception) {
        }
    }

    private fun handleAgentEvent(event: JSONObject, sessionId: String?) {
        val eventType = event.optString("type")
        val text = extractText(event) ?: return
        when (eventType) {
            "text_delta", "message_chunk" -> appendIncoming(text, streaming = true, sessionId = sessionId)
            "text_final", "message_final" -> appendIncoming(text, streaming = false, sessionId = sessionId)
            "error" -> appendIncoming("Error: $text", streaming = false, sessionId = sessionId)
        }
    }

    private fun extractText(event: JSONObject): String? {
        val data = event.optJSONObject("data")
        return when {
            data?.has("delta") == true -> data.getString("delta")
            data?.has("content") == true -> data.getString("content")
            data?.has("text") == true -> data.getString("text")
            else -> null
        }
    }

    private fun appendOutgoing(text: String, sessionId: String) {
        val index = sessions.indexOfFirst { it.id == sessionId }
        if (index == -1) return
        val message = Message(text = text, isOutgoing = true, timeLabel = "Now", isStreaming = false)
        val session = sessions[index]
        sessions[index] = session.copy(
            messages = session.messages + message,
            updatedAt = System.currentTimeMillis()
        )
    }

    private fun appendIncoming(text: String, streaming: Boolean, sessionId: String?) {
        val targetId = sessionId ?: lastSessionId ?: sessions.firstOrNull()?.id ?: return
        val index = sessions.indexOfFirst { it.id == targetId }
        if (index == -1) return
        val session = sessions[index]
        val updatedMessages = session.messages.toMutableList()

        if (streaming) {
            val last = updatedMessages.lastOrNull()
            if (last != null && !last.isOutgoing && last.isStreaming) {
                updatedMessages[updatedMessages.lastIndex] = last.copy(text = last.text + text)
            } else {
                updatedMessages.add(Message(text = text, isOutgoing = false, timeLabel = "Now", isStreaming = true))
            }
        } else {
            val last = updatedMessages.lastOrNull()
            if (last != null && !last.isOutgoing && last.isStreaming) {
                updatedMessages[updatedMessages.lastIndex] = last.copy(text = text, isStreaming = false)
            } else {
                updatedMessages.add(Message(text = text, isOutgoing = false, timeLabel = "Now", isStreaming = false))
            }
        }

        val unread = if (activeSessionId == targetId) 0 else session.unread + 1
        sessions[index] = session.copy(
            messages = updatedMessages,
            updatedAt = System.currentTimeMillis(),
            unread = unread
        )
    }

    private fun parsePairingPayload(payload: String): PairingPayload? {
        return try {
            val json = JSONObject(payload)
            val token = json.getString("token")
            val port = json.getInt("port")
            val addressesJson = json.optJSONArray("addresses") ?: JSONArray()
            val addresses = mutableListOf<String>()
            for (i in 0 until addressesJson.length()) {
                addresses.add(addressesJson.getString(i))
            }
            val wsPath = json.optString("ws_path", "/ws")
            PairingPayload(token, port, addresses, wsPath)
        } catch (_: Exception) {
            null
        }
    }

    private fun applySessionList(list: JSONArray) {
        val summaries = mutableListOf<SessionSummary>()
        for (i in 0 until list.length()) {
            val item = list.optJSONObject(i) ?: continue
            summaries.add(
                SessionSummary(
                    id = item.optString("id"),
                    title = item.optString("title"),
                    sessionType = item.optString("session_type"),
                    createdAt = item.optLong("created_at"),
                    updatedAt = item.optLong("updated_at"),
                    lastMessagePreview = item.optString("last_message_preview").ifBlank { null },
                    lastMessageRole = item.optString("last_message_role").ifBlank { null },
                    messageCount = item.optInt("message_count")
                )
            )
        }
        val existing = sessions.associateBy { it.id }
        val next = summaries.map { summary ->
            val previous = existing[summary.id]
            AgentSession(
                id = summary.id,
                name = summary.title,
                isPinned = previous?.isPinned ?: false,
                unread = previous?.unread ?: 0,
                messages = previous?.messages ?: emptyList(),
                updatedAt = summary.updatedAt,
                createdAt = summary.createdAt,
                lastMessagePreview = summary.lastMessagePreview,
                lastMessageRole = summary.lastMessageRole
            )
        }
        sessions.clear()
        sessions.addAll(next)
        if (activeSessionId != null && sessions.none { it.id == activeSessionId }) {
            activeSessionId = null
        }
    }

    private fun postStatus(status: String) {
        mainHandler.post { connectionStatus = status }
    }

    private fun postError(message: String?) {
        mainHandler.post { errorMessage = message }
    }
}

@Composable
private fun PairingScreen(store: MobileGatewayStore) {
    var payload by remember { mutableStateOf(store.pairingPayload) }
    var showScanner by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val cameraGranted = remember { mutableStateOf(isCameraGranted(context)) }
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        cameraGranted.value = granted
        if (granted) {
            showScanner = true
        }
    }

    if (showScanner) {
        Box(modifier = Modifier.fillMaxSize()) {
            QrScannerView(
                onResult = { code ->
                    payload = code
                    store.applyPairing(code)
                    showScanner = false
                }
            )
            IconButton(
                onClick = { showScanner = false },
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp)
            ) {
                Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.White)
            }
        }
        return
    }

    Scaffold { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFFF2F2F7))
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = Icons.Default.QrCodeScanner,
                contentDescription = null,
                tint = Color(0xFF007AFF),
                modifier = Modifier.size(72.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text("Pair with Desktop", fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Scan the QR code shown in Lumina Desktop > Settings > Mobile Connect.",
                textAlign = TextAlign.Center,
                color = Color(0xFF8E8E93)
            )
            Spacer(modifier = Modifier.height(20.dp))
            Button(onClick = {
                if (cameraGranted.value) {
                    showScanner = true
                } else {
                    permissionLauncher.launch(Manifest.permission.CAMERA)
                }
            }) {
                Text("Scan QR")
            }
            Spacer(modifier = Modifier.height(16.dp))
            TextField(
                value = payload,
                onValueChange = { payload = it },
                placeholder = { Text("Paste pairing payload") },
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(modifier = Modifier.height(12.dp))
            Button(onClick = {
                if (payload.trim().isNotEmpty()) {
                    store.applyPairing(payload.trim())
                }
            }) {
                Text("Pair")
            }
        }
    }
}

@Composable
private fun QrScannerView(onResult: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(context) }
    var hasResult by remember { mutableStateOf(false) }
    val transition = rememberInfiniteTransition(label = "scan-line")
    val scanProgress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scan-progress"
    )
    val boxSize = 240.dp
    val lineHeight = 2.dp
    val density = LocalDensity.current
    val lineOffset = with(density) {
        val boxPx = boxSize.toPx()
        val linePx = lineHeight.toPx()
        ((boxPx - linePx) * scanProgress).toDp()
    }

    androidx.compose.runtime.DisposableEffect(lifecycleOwner) {
        val executor = ContextCompat.getMainExecutor(context)
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        val listener = Runnable {
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().apply {
                setSurfaceProvider(previewView.surfaceProvider)
            }

            val options = BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build()
            val scanner = BarcodeScanning.getClient(options)

            val analysis = ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()

            analysis.setAnalyzer(executor) { imageProxy ->
                processImageProxy(scanner, imageProxy, hasResult) { value ->
                    if (!hasResult) {
                        hasResult = true
                        onResult(value)
                    }
                }
            }

            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                lifecycleOwner,
                CameraSelector.DEFAULT_BACK_CAMERA,
                preview,
                analysis
            )
        }

        cameraProviderFuture.addListener(listener, executor)
        onDispose {
            try {
                ProcessCameraProvider.getInstance(context).get().unbindAll()
            } catch (_: Exception) {
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())
        Box(
            modifier = Modifier
                .align(Alignment.Center)
                .size(boxSize)
                .border(2.dp, Color(0xFF00C853), RoundedCornerShape(16.dp))
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(lineHeight)
                    .offset(y = lineOffset)
                    .background(Color(0xFF00C853), RectangleShape)
            )
        }
    }
}

private fun processImageProxy(
    scanner: com.google.mlkit.vision.barcode.BarcodeScanner,
    imageProxy: ImageProxy,
    hasResult: Boolean,
    onResult: (String) -> Unit
) {
    val mediaImage = imageProxy.image
    if (mediaImage != null && !hasResult) {
        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
        scanner.process(image)
            .addOnSuccessListener { barcodes ->
                val value = barcodes.firstOrNull()?.rawValue
                if (value != null) {
                    onResult(value)
                }
            }
            .addOnCompleteListener {
                imageProxy.close()
            }
    } else {
        imageProxy.close()
    }
}

@Composable
private fun ChatListScreen(store: MobileGatewayStore) {
    var searchText by remember { mutableStateOf("") }
    var showMenu by remember { mutableStateOf(false) }
    var showRePairConfirm by remember { mutableStateOf(false) }
    val query = searchText.trim()
    val filtered = store.sessions
        .filter { session ->
            if (query.isEmpty()) {
                true
            } else {
                session.name.contains(query, ignoreCase = true) ||
                    (session.messages.lastOrNull()?.text?.contains(query, ignoreCase = true) == true)
            }
        }
        .sortedWith(compareByDescending<AgentSession> { it.isPinned }.thenByDescending { it.updatedAt })

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Chats", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    TextButton(onClick = {}) { Text("Edit", color = Color(0xFF007AFF)) }
                },
                actions = {
                    Box {
                        IconButton(onClick = { showMenu = true }) {
                            Icon(Icons.Default.MoreVert, contentDescription = "More")
                        }
                        DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                            DropdownMenuItem(
                                text = { Text("重新配对") },
                                onClick = {
                                    showMenu = false
                                    showRePairConfirm = true
                                }
                            )
                        }
                    }
                    TextButton(onClick = { store.requestSessionCreate() }) {
                        Icon(Icons.Default.Edit, contentDescription = "Compose", tint = Color(0xFF007AFF))
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFFF2F2F7))
        ) {
            TextField(
                value = searchText,
                onValueChange = { searchText = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                placeholder = { Text("Search") }
            )
            LazyColumn(modifier = Modifier.fillMaxSize()) {
                items(filtered) { chat ->
                    ChatRow(chat = chat, onClick = { store.setActiveSession(chat.id) }, onTogglePin = {
                        val index = store.sessions.indexOfFirst { it.id == chat.id }
                        if (index != -1) {
                            val session = store.sessions[index]
                            store.sessions[index] = session.copy(isPinned = !session.isPinned)
                        }
                    })
                    Divider(color = Color(0xFFE5E5EA))
                }
            }
        }
    }

    if (showRePairConfirm) {
        AlertDialog(
            onDismissRequest = { showRePairConfirm = false },
            title = { Text("重新配对") },
            text = { Text("将断开当前连接并返回扫码页面。") },
            confirmButton = {
                TextButton(onClick = {
                    showRePairConfirm = false
                    store.resetPairing()
                }) { Text("重新配对") }
            },
            dismissButton = {
                TextButton(onClick = { showRePairConfirm = false }) { Text("取消") }
            }
        )
    }
}

@Composable
private fun ChatRow(chat: AgentSession, onClick: () -> Unit, onTogglePin: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() }
            .background(Color(0xFFFFFFFF))
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(44.dp)
                .background(Color(0xFFD1D1D6), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(text = chat.name.take(1), color = Color.White, fontWeight = FontWeight.Bold)
        }

        Spacer(modifier = Modifier.width(12.dp))

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = chat.name,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f)
                )
                Text(text = formatTimeLabel(chat.updatedAt), fontSize = 12.sp, color = Color(0xFF8E8E93))
            }
            Spacer(modifier = Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = chat.messages.lastOrNull()?.text ?: chat.lastMessagePreview.orEmpty(),
                    fontSize = 14.sp,
                    color = Color(0xFF8E8E93),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                if (chat.unread > 0) {
                    Box(
                        modifier = Modifier
                            .padding(start = 8.dp)
                            .background(Color(0xFF007AFF), RoundedCornerShape(12.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(text = chat.unread.toString(), color = Color.White, fontSize = 12.sp)
                    }
                }
            }
        }

        Spacer(modifier = Modifier.width(8.dp))

        Text(
            text = if (chat.isPinned) "PIN" else "",
            fontSize = 10.sp,
            color = Color(0xFF8E8E93),
            modifier = Modifier.clickable { onTogglePin() }
        )
    }
}

@Composable
private fun ChatDetailScreen(store: MobileGatewayStore, sessionIndex: Int) {
    val session = store.sessions[sessionIndex]
    var draft by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(session.name, fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = { store.setActiveSession(null) }) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color(0xFFF2F2F7))
        ) {
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(session.messages) { msg ->
                    MessageBubble(message = msg)
                }
            }
            Divider(color = Color(0xFFE5E5EA))
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFF9F9FB))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                TextField(
                    value = draft,
                    onValueChange = { draft = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Message") }
                )
                Spacer(modifier = Modifier.width(8.dp))
                Button(onClick = {
                    val trimmed = draft.trim()
                    if (trimmed.isNotEmpty()) {
                        store.sendCommand(trimmed, session.id)
                        draft = ""
                    }
                }) {
                    Text("Send")
                }
            }
        }
    }
}

@Composable
private fun MessageBubble(message: Message) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = if (message.isOutgoing) Arrangement.End else Arrangement.Start
    ) {
        val textColor = if (message.isOutgoing) Color.White else Color.Black
        val linkColor = if (message.isOutgoing) Color.White else Color(0xFF007AFF)
        Column(
            modifier = Modifier
                .background(
                    if (message.isOutgoing) Color(0xFF007AFF) else Color(0xFFE5E5EA),
                    RoundedCornerShape(16.dp)
                )
                .padding(horizontal = 12.dp, vertical = 8.dp)
        ) {
            MarkdownMessageText(
                text = message.text,
                color = textColor,
                linkColor = linkColor,
                fontSize = 14.sp
            )
            Text(
                text = message.timeLabel,
                color = if (message.isOutgoing) Color(0xCCFFFFFF) else Color(0xFF6D6D72),
                fontSize = 10.sp
            )
        }
    }
}

@Composable
private fun MarkdownMessageText(
    text: String,
    color: Color,
    linkColor: Color,
    fontSize: androidx.compose.ui.unit.TextUnit
) {
    val context = LocalContext.current
    val markwon = remember(context) {
        Markwon.builder(context)
            .usePlugin(LinkifyPlugin.create())
            .build()
    }
    AndroidView(
        factory = { ctx ->
            TextView(ctx).apply {
                setTextColor(color.toArgb())
                setLinkTextColor(linkColor.toArgb())
                setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize.value)
                setLineSpacing(0f, 1.2f)
                movementMethod = LinkMovementMethod.getInstance()
            }
        },
        update = { view ->
            view.setTextColor(color.toArgb())
            view.setLinkTextColor(linkColor.toArgb())
            view.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSize.value)
            markwon.setMarkdown(view, text)
        }
    )
}

private fun isCameraGranted(context: Context): Boolean {
    return ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
}

private fun formatTimeLabel(timestamp: Long): String {
    val zone = ZoneId.systemDefault()
    val dateTime = Instant.ofEpochMilli(timestamp).atZone(zone)
    val now = ZonedDateTime.now(zone)
    val pattern = if (dateTime.toLocalDate() == now.toLocalDate()) "HH:mm" else "MMM d"
    return DateTimeFormatter.ofPattern(pattern).format(dateTime)
}

private object PairingPrefs {
    private const val PREFS = "lumina_mobile"
    private const val KEY_PAIRED = "paired"
    private const val KEY_PAYLOAD = "pairing_payload"

    fun isPaired(context: Context): Boolean {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_PAIRED, false)
    }

    fun setPaired(context: Context, paired: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putBoolean(KEY_PAIRED, paired)
            .apply()
    }

    fun getPayload(context: Context): String {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getString(KEY_PAYLOAD, "") ?: ""
    }

    fun setPayload(context: Context, payload: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PAYLOAD, payload)
            .apply()
    }
}
