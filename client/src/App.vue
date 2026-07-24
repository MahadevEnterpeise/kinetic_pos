<script setup>
// Imports can go here if needed later
</script>

<template>
  <div class="app-container">
      <router-view/>
        </div>
        </template>
        <style>
        :root {
          /* This ensures it applies to everything */
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
              line-height: 1.5;
                font-weight: 400;
                  
                    /* Kinetic Code Brand Colors */
                      --primary-blue: #007bff; 
                        --dark-text: #1a1a1a;
                          padding: 0;
                            margin: 0;
                            }
                            
                            body {
                              margin: 0;
                                font-family: 'Inter', sans-serif;
                                  color: var(--dark-text);
                                    background-color: #f9fafb;
                                      min-height: 100vh;
                                      }
                                      
                                      /* Make headings feel more like "Kinetic Code" branding */
                                      h1, h2, h3 {
                                        font-weight: 700;
                                          letter-spacing: -0.02em; /* Gives it a premium, tight look */
                                          }
                                          .app-container {
                                            width: 100%;
                                              max-width: 100vw;
                                                display: flex;
                                                  align-items: center;
                                                    justify-content: center;
                                                    }
                                                    </style>
                                                    