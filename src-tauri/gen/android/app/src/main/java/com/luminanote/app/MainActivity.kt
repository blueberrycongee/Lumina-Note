package com.luminanote.app

import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    
    // 注册语音识别插件（Android 原生 SpeechRecognizer）
    registerPlugin(SpeechPlugin::class.java)
  }
}
