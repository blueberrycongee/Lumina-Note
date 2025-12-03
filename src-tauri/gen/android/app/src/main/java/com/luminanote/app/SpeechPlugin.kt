package com.luminanote.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class SpeechPlugin(private val activity: Activity) : Plugin(activity) {
    private var speechRecognizer: SpeechRecognizer? = null
    private var currentInvoke: Invoke? = null
    private var isListening = false
    private val TAG = "SpeechPlugin"

    override fun load(webView: android.webkit.WebView) {
        super.load(webView)
        Log.d(TAG, "SpeechPlugin loaded")
    }

    @Command
    fun startListening(invoke: Invoke) {
        Log.d(TAG, "startListening called")

        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            val ret = JSObject()
            ret.put("success", false)
            ret.put("error", "Speech recognition not available on this device")
            invoke.resolve(ret)
            return
        }

        if (isListening) {
            val ret = JSObject()
            ret.put("success", false)
            ret.put("error", "Already listening")
            invoke.resolve(ret)
            return
        }

        currentInvoke = invoke
        isListening = true

        activity.runOnUiThread {
            try {
                speechRecognizer = SpeechRecognizer.createSpeechRecognizer(activity)
                speechRecognizer?.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {
                        Log.d(TAG, "Ready for speech")
                        trigger("speech_ready", JSObject())
                    }

                    override fun onBeginningOfSpeech() {
                        Log.d(TAG, "Beginning of speech")
                    }

                    override fun onRmsChanged(rmsdB: Float) { }

                    override fun onBufferReceived(buffer: ByteArray?) { }

                    override fun onEndOfSpeech() {
                        Log.d(TAG, "End of speech")
                        isListening = false
                    }

                    override fun onError(error: Int) {
                        Log.e(TAG, "Speech error: $error")
                        isListening = false

                        val errorMessage = when (error) {
                            SpeechRecognizer.ERROR_AUDIO -> "Audio recording error"
                            SpeechRecognizer.ERROR_CLIENT -> "Client side error"
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "Insufficient permissions"
                            SpeechRecognizer.ERROR_NETWORK -> "Network error"
                            SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "Network timeout"
                            SpeechRecognizer.ERROR_NO_MATCH -> "No speech match"
                            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "Recognizer busy"
                            SpeechRecognizer.ERROR_SERVER -> "Server error"
                            SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "Speech timeout"
                            else -> "Unknown error: $error"
                        }

                        currentInvoke?.let {
                            val ret = JSObject()
                            ret.put("success", false)
                            ret.put("error", errorMessage)
                            it.resolve(ret)
                            currentInvoke = null
                        }

                        destroyRecognizer()
                    }

                    override fun onResults(results: Bundle?) {
                        Log.d(TAG, "Speech results received")
                        isListening = false

                        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        val text = matches?.firstOrNull() ?: ""

                        currentInvoke?.let {
                            val ret = JSObject()
                            ret.put("success", true)
                            ret.put("text", text)
                            it.resolve(ret)
                            currentInvoke = null
                        }

                        destroyRecognizer()
                    }

                    override fun onPartialResults(partialResults: Bundle?) {
                        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        val text = matches?.firstOrNull() ?: ""

                        if (text.isNotEmpty()) {
                            val event = JSObject()
                            event.put("text", text)
                            trigger("speech_partial", event)
                        }
                    }

                    override fun onEvent(eventType: Int, params: Bundle?) { }
                })

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, "zh-CN")
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                }

                speechRecognizer?.startListening(intent)
                Log.d(TAG, "Started listening")

            } catch (e: Exception) {
                Log.e(TAG, "Error starting speech recognition", e)
                isListening = false
                currentInvoke?.let {
                    val ret = JSObject()
                    ret.put("success", false)
                    ret.put("error", e.message ?: "Unknown error")
                    it.resolve(ret)
                    currentInvoke = null
                }
            }
        }
    }

    @Command
    fun stopListening(invoke: Invoke) {
        Log.d(TAG, "stopListening called")

        activity.runOnUiThread {
            try {
                speechRecognizer?.stopListening()
                isListening = false

                val ret = JSObject()
                ret.put("success", true)
                invoke.resolve(ret)
            } catch (e: Exception) {
                val ret = JSObject()
                ret.put("success", false)
                ret.put("error", e.message)
                invoke.resolve(ret)
            }
        }
    }

    @Command
    fun cancelListening(invoke: Invoke) {
        Log.d(TAG, "cancelListening called")

        activity.runOnUiThread {
            try {
                speechRecognizer?.cancel()
                isListening = false
                currentInvoke = null
                destroyRecognizer()

                val ret = JSObject()
                ret.put("success", true)
                invoke.resolve(ret)
            } catch (e: Exception) {
                val ret = JSObject()
                ret.put("success", false)
                ret.put("error", e.message)
                invoke.resolve(ret)
            }
        }
    }

    private fun destroyRecognizer() {
        try {
            speechRecognizer?.destroy()
            speechRecognizer = null
        } catch (e: Exception) {
            Log.e(TAG, "Error destroying recognizer", e)
        }
    }
}
