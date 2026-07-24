<template>
  <div class="kinetic-pos-container">
    <div class="loader-wrapper">
      <!-- Background Track Ring -->
      <div class="ring track-ring" :class="sizeClass"></div>
      
      <!-- Kinetic Accent Ring (Fast Outer Core) -->
      <div class="ring accent-ring" :class="sizeClass"></div>
      
      <!-- Main Momentum Ring (Slower Counter-Rotation) -->
      <div class="ring momentum-ring" :class="sizeClass"></div>
      
      <!-- Core Pulse -->
      <div class="core-pulse"></div>
    </div>
    
    <!-- System Branding & Status -->
    <div class="status-text">
      <span class="brand-tag">Kinetic POS</span>
      <p class="message">{{ message }}</p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  message: {
    type: String,
    default: 'Talking with server...'
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value)
  }
})

const sizeClass = computed(() => `size-${props.size}`)
</script>

<style scoped>
/* Container Layout */
.kinetic-pos-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background-color: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  border: 1px solid #f1f5f9;
  max-width: 240px;
  margin: 0 auto;
  font-family: system-ui, -apple-system, sans-serif;
}

.loader-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
}

/* Base Ring Properties */
.ring {
  border-radius: 50%;
  position: absolute;
  box-sizing: border-box;
}

/* Size Variants */
.size-sm { width: 32px; height: 32px; border-width: 3px; }
.size-md { width: 56px; height: 56px; border-width: 4px; }
.size-lg { width: 80px; height: 80px; border-width: 6px; }

/* Dynamic Layer Styling & Animations */
.track-ring {
  position: static; /* Establishes the structural bounding box */
  border-style: solid;
  border-color: #dbeafe; /* Light blue track background */
}

.accent-ring {
  border-style: solid;
  border-color: #2563eb transparent transparent transparent; /* Deep brand blue */
  animation: spin 0.6s linear infinite;
}

.momentum-ring {
  border-style: solid;
  border-color: transparent transparent #3b82f6 #60a5fa; /* Gradient blue illusion */
  animation: spin 1.2s linear infinite reverse;
}

.core-pulse {
  position: absolute;
  width: 8px;
  height: 8px;
  background-color: #2563eb;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

/* Typography styling */
.status-text {
  text-align: center;
}

.brand-tag {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.message {
  margin: 0.125rem 0 0 0;
  font-size: 0.875rem;
  font-weight: 500;
  color: #475569;
}

/* Keyframe Animations */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { transform: scale(0.8); opacity: 0.5; }
  50% { transform: scale(1.2); opacity: 1; }
}
</style>
