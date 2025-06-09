package com.mafiagame.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.webkit.*
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.mafiagame.app.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    
    private lateinit var binding: ActivityMainBinding
    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        
        setupWebView()
        setupSwipeRefresh()
        loadGame()
    }
    
    private fun setupWebView() {
        webView = binding.webView
        swipeRefresh = binding.swipeRefresh
        
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true
            cacheMode = WebSettings.LOAD_DEFAULT
        
            // ОТКЛЮЧАЕМ ВОЗМОЖНОСТЬ ОБНОВЛЕНИЯ
            allowContentAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
        }
        
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false
            
                // Отключаем pull-to-refresh через JavaScript
                view?.evaluateJavascript("""
                    document.addEventListener('touchstart', function(e) {
                        if (e.touches.length > 1) {
                            e.preventDefault();
                        }
                    }, { passive: false });
                    
                    document.addEventListener('touchmove', function(e) {
                        if (window.scrollY === 0) {
                            e.preventDefault();
                        }
                    }, { passive: false });
                    
                    document.body.style.overscrollBehavior = 'none';
                    document.documentElement.style.overscrollBehavior = 'none';
                """, null)
            }
            
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                swipeRefresh.isRefreshing = false
                Toast.makeText(this@MainActivity, "Ошибка загрузки игры", Toast.LENGTH_SHORT).show()
            }
        }
        
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage?): Boolean {
                consoleMessage?.let {
                    println("WebView Console: ${it.message()}")
                }
                return true
            }
        }
    
        // ОТКЛЮЧАЕМ ЖЕСТЫ ОБНОВЛЕНИЯ
        webView.setOnTouchListener { _, event ->
            // Блокируем свайп вниз когда страница в самом верху
            if (event.action == android.view.MotionEvent.ACTION_MOVE && webView.scrollY == 0) {
                return@setOnTouchListener true
            }
            false
        }
    }
    
    private fun setupSwipeRefresh() {
        // ОТКЛЮЧАЕМ SwipeRefresh полностью
        swipeRefresh.isEnabled = false
        
        // Убираем все обработчики
        swipeRefresh.setOnRefreshListener(null)
        
        // Скрываем индикатор если он есть
        swipeRefresh.isRefreshing = false
    }
    
    private fun loadGame() {
        swipeRefresh.isRefreshing = true
        webView.loadUrl("file:///android_asset/index.html")
    }
    
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
    
    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
