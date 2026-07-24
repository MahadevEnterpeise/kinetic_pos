<script setup>
import { ref } from 'vue'

// You can define your state or variables here when you add functionality later
const companyName = ref('Kinetic Code')
const currentYear = ref(2026)
</script>

<template>
  <div class="app-container">
    
    <!-- Header -->
    <header class="site-header">
      <div class="header-content">
        <div class="logo-area">
          <!-- Conceptual Tech Logo Icon -->
          <div class="logo-icon">
            <span class="icon-symbol">&#x23E9;</span>
          </div>
          <span class="brand-name">{{ companyName }}</span>
        </div>
        <span class="badge-hq">Global HQ</span>
      </div>
    </header>

    <!-- Main Hero / Product Section -->
    <main class="main-content">
      
      <!-- Subtle Status Indicator -->
      <div class="status-container">
        <span class="status-badge">
          <span class="pulse-dot"></span>
          Flagship Project Launch
        </span>
      </div>

      <!-- Main Headline -->
      <h1 class="hero-headline">
        Next-Generation <br>
        <span class="gradient-text">Tech Ecosystems</span>
      </h1>

      <!-- Short Description -->
      <p class="hero-description">
        We engineer high-performance, future-focused software solutions. Our premier enterprise cloud platform is ready for deployment.
      </p>

      <!-- POS Product Card -->
      <div class="product-card">
        <div class="card-header">
          <h3 class="product-title">Kinetic POS Pro</h3>
          <span class="version-tag">v1.0.0-stable</span>
        </div>
        <p class="product-description">
          A robust, lightning-fast point of sale terminal built for scalable retail operations, smart cloud analytics.
        </p>
        
        <!-- Action Buttons Layout -->
        <div class="button-group">
          <a href="/auth" class="btn btn-primary">
            <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            Launch Kinetic POS
          </a>
          <a href="#" class="btn btn-secondary">
            Launch Web Terminal
            <svg class="btn-icon-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
            </svg>
          </a>
        </div>
      </div>

    </main>

    <!-- Footer -->
    <footer class="site-footer">
      <div class="footer-content">
        <div>
          &copy; {{ currentYear }} {{ companyName }} Headquarters Pvt Ltd. All rights reserved.
        </div>
        <div class="footer-note">
          <span class="diamond">&#x25C6;</span>
          <span>Enterprise Security Included</span>
        </div>
      </div>
    </footer>

  </div>
</template>

<style scoped>
/* Base Theme Variables (Dark Blue & Deep Black Palette) */
.app-container {
  --bg-main: #030712;
  --bg-card: #0b1329;
  --text-main: #f3f4f6;
  --text-muted: #9ca3af;
  --blue-primary: #2563eb;
  --blue-hover: #3b82f6;
  --border-color: #1e3a8a40;
  
  background-color: var(--bg-main);
  color: var(--text-main);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-family: system-ui, -apple-system, sans-serif;
}

/* Header Styling */
.site-header {
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(3, 7, 18, 0.8);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 50;
}
.header-content {
  max-width: 1140px;
  margin: 0 auto;
  padding: 0 24px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo-area {
  display: flex;
  align-items: center;
  gap: 12px;
}
.logo-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: linear-gradient(135deg, #1d4ed8, #3b82f6);
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-symbol {
  color: #000;
  font-weight: bold;
  font-size: 18px;
}
.brand-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.025em;
}
.badge-hq {
  font-size: 12px;
  font-family: monospace;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #3b82f6;
  background-color: rgba(30, 58, 138, 0.4);
  padding: 6px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(30, 58, 138, 0.3);
}

/* Main Layout & Hero Elements */
.main-content {
  max-width: 896px;
  margin: 0 auto;
  padding: 80px 24px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  text-align: center;
}
.status-container {
  margin-bottom: 24px;
}
.status-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 500;
  background-color: rgba(30, 58, 138, 0.6);
  color: #60a5fa;
  border: 1px solid rgba(30, 58, 138, 0.3);
}
.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: #60a5fa;
}
.hero-headline {
  font-size: 48px;
  font-weight: 700;
  letter-spacing: -0.025em;
  margin-bottom: 24px;
  line-height: 1.2;
}
.gradient-text {
  background: linear-gradient(to right, #60a5fa, #3b82f6, #2563eb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.hero-description {
  color: var(--text-muted);
  font-size: 18px;
  max-w: 640px;
  margin: 0 auto 48px auto;
  font-weight: 300;
  line-height: 1.6;
}

/* Product Card Design */
.product-card {
  background: linear-gradient(to bottom, #111827, var(--bg-card));
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 32px;
  max-w: 576px;
  margin: 0 auto;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  text-align: left;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.product-title {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.025em;
}
.version-tag {
  font-family: monospace;
  font-size: 12px;
  color: #6b7280;
}
.product-description {
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 24px;
}

/* Clean Button Styling */
.button-group {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
@media (min-width: 640px) {
  .button-group {
    flex-direction: row;
  }
}
.btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 500;
  padding: 12px 24px;
  border-radius: 12px;
  text-decoration: none;
  transition: all 0.2s ease;
}
.btn-primary {
  background-color: var(--blue-primary);
  color: white;
  box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.2);
}
.btn-primary:hover {
  background-color: var(--blue-hover);
}
.btn-secondary {
  background-color: transparent;
  color: #60a5fa;
  border: 1px solid #1e3a8a;
}
.btn-secondary:hover {
  background-color: rgba(30, 58, 138, 0.2);
  border-color: #3b82f6;
}
.btn-icon {
  width: 20px;
  height: 20px;
}
.btn-icon-arrow {
  width: 16px;
  height: 16px;
}

/* Footer Styling */
.site-footer {
  border-top: 1px solid rgba(30, 58, 138, 0.2);
  background-color: rgba(2, 6, 23, 0.4);
  padding: 32px 0;
}
.footer-content {
  max-w: 1140px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-family: monospace;
  font-size: 12px;
  color: #6b7280;
}
@media (min-width: 640px) {
  .footer-content {
    flex-direction: row;
  }
}
.footer-note {
  display: flex;
  align-items: center;
  gap: 24px;
}
.diamond {
  color: rgba(30, 58, 138, 0.6);
}
</style>
