import Head from 'next/head'
import { useState, useEffect } from 'react'

export default function PropertyAgentPro() {
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentMatches, setCurrentMatches] = useState([])
  const [notification, setNotification] = useState({ message: '', type: '', show: false })

  // Configuration - CLOUDFLARE ONLY - FIXED ENDPOINTS
  const CONFIG = {
    N8N_BASE_URL: process.env.NEXT_PUBLIC_N8N_URL || 'https://n8n.opsmith.biz/webhook',
    AGENT_ID: process.env.NEXT_PUBLIC_AGENT_ID || 'jermaine-tan-001',
    CLOUDFLARE_WORKER_URL: process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL || 'https://propertyagent.opsmith.biz'
  }

  const ENDPOINTS = {
    MATCH_LEADS: CONFIG.N8N_BASE_URL + '/clean-r2-match-leads', // FIXED: Now matches n8n workflow
    SEND_MESSAGE: CONFIG.N8N_BASE_URL + '/send-message'
  }

  useEffect(() => {
    console.log('🎯 PropertyAgent Pro v2.0 Cloudflare-Only Initialized')
    console.log('🔧 Fixed endpoints:', ENDPOINTS)
    checkSystemStatus()
  }, [])

  const showNotification = (message, type = 'info') => {
    setNotification({ message, type, show: true })
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }))
    }, 4000)
  }

  const checkSystemStatus = async () => {
    try {
      await fetch(ENDPOINTS.MATCH_LEADS, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({body: {action: 'health_check'}})
      })
    } catch (error) {
      console.error('System check failed:', error)
    }
  }

  const triggerCloudflareUpload = () => {
    document.getElementById('fileInput').click()
  }

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files)
    
    for (const file of files) {
      if (validateFile(file)) {
        try {
          showNotification(`🎯 Uploading ${file.name} to Cloudflare...`, 'info')
          
          const uploadResult = await uploadToCloudflare(file)
          setUploadedFiles(prev => [...prev, uploadResult])
          
          showNotification(`✅ ${file.name} uploaded with tracking!`, 'success')
          
        } catch (error) {
          console.error('❌ Upload failed:', error)
          showNotification(`❌ Failed to upload ${file.name}: ${error.message}`, 'error')
        }
      }
    }
    
    event.target.value = ''
  }

  const uploadToCloudflare = async (file) => {
    const messageId = `cf_msg_${Date.now()}`
    const formData = new FormData()
    formData.append('file', file)
    formData.append('agentId', CONFIG.AGENT_ID)
    formData.append('messageId', messageId)

    const response = await fetch(`${CONFIG.CLOUDFLARE_WORKER_URL}/upload`, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Cloudflare upload failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const result = await response.json()
    
    return {
      name: result.originalName || file.name,
      type: getFileTypeFromMime(file.type),
      size: result.fileSize || file.size,
      cloudinaryUrl: result.trackingUrl,
      trackingUrl: result.trackingUrl,
      trackingId: result.trackingId,
      publicId: result.trackingId,
      format: getFormatFromMime(file.type),
      uploadedAt: new Date().toISOString(),
      uploadMethod: 'cloudflare',
      // Additional fields for clean R2 workflow
      fileType: file.type
    }
  }

  const validateFile = (file) => {
    const maxSize = 50 * 1024 * 1024 // 50MB
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ]

    if (file.size > maxSize) {
      showNotification(`File ${file.name} is too large. Maximum size is 50MB.`, 'error')
      return false
    }

    if (!allowedTypes.includes(file.type)) {
      showNotification(`File type ${file.type} is not supported.`, 'error')
      return false
    }

    return true
  }

  const getFileTypeFromMime = (mimeType) => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType === 'application/pdf') return 'pdf'
    if (mimeType.includes('video/')) return 'video'
    return 'document'
  }

  const getFormatFromMime = (mimeType) => {
    const typeMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
    }
    return typeMap[mimeType] || 'unknown'
  }

  const removeFile = (index) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index))
    showNotification('File removed', 'info')
  }

  const getFileIcon = (fileType) => {
    if (fileType === 'image') return '🖼️'
    if (fileType === 'pdf') return '📄'
    if (fileType === 'video') return '🎥'
    return '📁'
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const findMatchingLeads = async () => {
    const messageContent = document.getElementById('messageInput').value.trim()
    
    if (!messageContent) {
      showNotification('Please enter your message content first', 'error')
      return
    }

    if (isProcessing) return

    setIsProcessing(true)
    showNotification('Analyzing message & finding leads...', 'info')

    try {
      // Updated payload structure for clean R2 workflow
      const requestPayload = {
        body: {
          action: 'match_leads',
          messageContent: messageContent,
          agentId: CONFIG.AGENT_ID,
          uploadedFiles: uploadedFiles.map(file => ({
            name: file.name,
            trackingUrl: file.trackingUrl,
            trackingId: file.trackingId,
            fileType: file.fileType || file.type,
            fileSize: file.size
          }))
        }
      }

      console.log('🚀 Sending to clean R2 endpoint:', ENDPOINTS.MATCH_LEADS)
      console.log('📦 Request payload:', requestPayload)

      const response = await fetch(ENDPOINTS.MATCH_LEADS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      })

      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText)
      }

      const responseText = await response.text()
      console.log('📥 Raw response:', responseText)
      
      if (!responseText.trim()) {
        throw new Error('Empty response from n8n workflow')
      }

      let cleanedResponse = responseText.trim()
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '')
      }

      const result = JSON.parse(cleanedResponse)

      if (result && result.matches && Array.isArray(result.matches)) {
        setCurrentMatches(result.matches)
        
        const fileCount = uploadedFiles.length
        const fileMsg = fileCount > 0 ? ` with ${fileCount} Cloudflare-tracked file${fileCount > 1 ? 's' : ''}` : ''
        showNotification(`Found ${result.matches.length} leads ranked by relevance${fileMsg}!`, 'success')
      } else {
        throw new Error('Response missing matches array')
      }

    } catch (error) {
      console.error('Error finding matches:', error)
      showNotification('Error finding matches: ' + error.message, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const clearAll = () => {
    document.getElementById('messageInput').value = ''
    setUploadedFiles([])
    setCurrentMatches([])
    showNotification('All content cleared', 'info')
  }

  const showFileAnalytics = async () => {
    try {
      showNotification('Loading analytics...', 'info')
      
      const response = await fetch(`${CONFIG.CLOUDFLARE_WORKER_URL}/analytics`)
      if (!response.ok) {
        throw new Error(`Analytics failed: ${response.statusText}`)
      }
      
      const analytics = await response.json()
      showNotification('Analytics loaded successfully', 'success')
      
    } catch (error) {
      console.error('Analytics error:', error)
      showNotification('Failed to load analytics: ' + error.message, 'error')
    }
  }

  // WhatsApp send function
  const sendWhatsAppMessage = async (index) => {
    const match = currentMatches[index]
    
    let cleanPhone = (match.phone || '').replace(/[^\d]/g, '')
    
    if (cleanPhone.length === 8) {
      cleanPhone = '65' + cleanPhone
    } else if (cleanPhone.startsWith('8') || cleanPhone.startsWith('9')) {
      cleanPhone = '65' + cleanPhone
    }
    
    const message = match.personalizedMessage || 'Hello from PropertyAgent Pro!'
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    
    window.open(whatsappUrl, '_blank')
    showNotification(`WhatsApp opened for ${match.name}!`, 'success')
    
    // Track message sending
    try {
      await fetch(ENDPOINTS.SEND_MESSAGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: {
            action: 'message_sent',
            leadName: match.name,
            phone: match.phone,
            message: message,
            agentId: CONFIG.AGENT_ID
          }
        })
      })
    } catch (error) {
      console.error('Error tracking message:', error)
    }
  }

  // Edit message function
  const editMessage = (index) => {
    const newMessage = prompt('Edit your message:', currentMatches[index].personalizedMessage)
    if (newMessage && newMessage.trim()) {
      setCurrentMatches(prev => prev.map((match, i) => 
        i === index ? { ...match, personalizedMessage: newMessage.trim() } : match
      ))
      showNotification('Message updated successfully!', 'success')
    }
  }

  return (
    <>
      <Head>
        <title>PropertyAgent Pro - Marketing v2.0</title>
        <meta name="description" content="PropertyAgent Pro WhatsApp Marketing Automation" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </Head>

      <style jsx>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: #2c3e50;
          font-size: 16px;
          line-height: 1.6;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          text-rendering: optimizeLegibility;
        }

        .header {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(15px);
          padding: 1.25rem 2rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
        }

        .header-content {
          max-width: 1400px;
          margin: 0 auto;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo {
          font-size: 1.75rem;
          font-weight: 800;
          color: white;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          letter-spacing: -0.02em;
        }

        .version-badge {
          background: #8b5cf6;
          color: white;
          padding: 0.25rem 0.625rem;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.025em;
          text-transform: uppercase;
        }

        .user-info {
          color: rgba(255, 255, 255, 0.95);
          display: flex;
          align-items: center;
          gap: 1.25rem;
          font-weight: 500;
          font-size: 0.95rem;
        }

        .analytics-btn {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 0.625rem 1.25rem;
          border-radius: 24px;
          cursor: pointer;
          font-size: 0.875rem;
          font-weight: 600;
          font-family: inherit;
          transition: all 0.3s ease;
          letter-spacing: 0.01em;
        }

        .analytics-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .status-indicator {
          padding: 0.375rem 0.875rem;
          border-radius: 24px;
          font-size: 0.8rem;
          font-weight: 600;
          background: rgba(46, 204, 113, 0.2);
          color: #27ae60;
          border: 1px solid rgba(46, 204, 113, 0.3);
          letter-spacing: 0.025em;
        }

        .container {
          max-width: 1400px;
          margin: 2rem auto;
          padding: 0 2rem;
        }

        .main-panel {
          background: rgba(255, 255, 255, 0.98);
          border-radius: 20px;
          padding: 2.5rem;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .section-title {
          font-size: 1.75rem;
          font-weight: 700;
          margin-bottom: 1.75rem;
          color: #2c3e50;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          letter-spacing: -0.025em;
        }

        .property-input {
          width: 100%;
          min-height: 140px;
          padding: 1.75rem;
          border: 2px solid #e8f2ff;
          border-radius: 16px;
          font-size: 1.05rem;
          font-family: inherit;
          font-weight: 400;
          line-height: 1.7;
          color: #2c3e50;
          outline: none;
          transition: all 0.3s ease;
          resize: vertical;
          background: rgba(255, 255, 255, 0.8);
        }

        .property-input:focus {
          border-color: #667eea;
          background: rgba(255, 255, 255, 1);
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .property-input::placeholder {
          color: #64748b;
          font-weight: 400;
          line-height: 1.6;
        }

        .upload-area {
          border: 3px dashed #8b5cf6;
          border-radius: 20px;
          padding: 2.5rem;
          text-align: center;
          transition: all 0.3s ease;
          background: linear-gradient(135deg, #f8f9ff 0%, #e8f5e8 100%);
          margin: 1.5rem 0;
          cursor: pointer;
        }

        .upload-area:hover {
          border-color: #667eea;
          background: linear-gradient(135deg, #e8f5e8 0%, #f8f9ff 100%);
          transform: scale(1.02);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
        }

        .upload-icon {
          width: 70px;
          height: 70px;
          background: #8b5cf6;
          border-radius: 50%;
          margin: 0 auto 1.25rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 28px;
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
        }

        .upload-btn {
          background: linear-gradient(135deg, #8b5cf6 0%, #667eea 100%);
          color: white;
          padding: 0.875rem 1.75rem;
          border: none;
          border-radius: 30px;
          cursor: pointer;
          font-size: 1.05rem;
          font-family: inherit;
          font-weight: 600;
          letter-spacing: 0.01em;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(139, 92, 246, 0.3);
        }

        .upload-btn:hover {
          background: linear-gradient(135deg, #7c3aed 0%, #5a6fd8 100%);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(139, 92, 246, 0.4);
        }

        .file-item {
          display: flex;
          align-items: center;
          gap: 1.25rem;
          padding: 1.25rem;
          background: linear-gradient(135deg, #f8f9ff 0%, #e8f5e8 100%);
          border-radius: 16px;
          margin-bottom: 0.875rem;
          border: 2px solid #8b5cf6;
          transition: all 0.3s ease;
        }

        .file-item:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
        }

        .file-icon {
          width: 48px;
          height: 48px;
          background: #8b5cf6;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
          font-size: 1.1rem;
        }

        .file-info {
          flex: 1;
        }

        .file-info > div:first-child {
          font-weight: 600;
          color: #2c3e50;
          font-size: 1rem;
          margin-bottom: 0.25rem;
        }

        .file-info > div:nth-child(2) {
          font-size: 0.875rem;
          color: #64748b;
          font-weight: 500;
        }

        .btn {
          padding: 1rem 1.75rem;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          font-weight: 600;
          font-family: inherit;
          font-size: 1rem;
          letter-spacing: 0.01em;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 0.625rem;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
        }

        .btn-secondary {
          background: #64748b;
          color: white;
        }

        .btn-secondary:hover {
          background: #475569;
          transform: translateY(-1px);
        }

        .btn:disabled {
          background: #94a3b8;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .lead-card {
          background: white;
          border-radius: 20px;
          padding: 2rem;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.08);
          border: 2px solid #e8f2ff;
          transition: all 0.3s ease;
          margin-bottom: 1.75rem;
        }

        .lead-card:hover {
          border-color: #667eea;
          transform: translateY(-3px);
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.12);
        }

        .lead-card h3 {
          font-weight: 700;
          color: #2c3e50;
          font-size: 1.25rem;
          margin-bottom: 0.5rem;
          letter-spacing: -0.01em;
        }

        .lead-card p {
          font-size: 0.95rem;
          color: #64748b;
          font-weight: 500;
          margin-bottom: 0.25rem;
        }

        .notification {
          position: fixed;
          top: 24px;
          right: 24px;
          padding: 1.25rem 1.75rem;
          border-radius: 16px;
          color: white;
          font-weight: 600;
          font-family: inherit;
          font-size: 0.95rem;
          z-index: 1000;
          transform: translateX(400px);
          transition: transform 0.3s ease;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
          letter-spacing: 0.01em;
        }

        .notification.show {
          transform: translateX(0);
        }

        .notification.success { 
          background: linear-gradient(135deg, #10b981 0%, #059669 100%); 
        }
        .notification.error { 
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); 
        }
        .notification.info { 
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); 
        }

        .action-buttons {
          display: flex;
          gap: 1.25rem;
          margin-top: 1.5rem;
        }

        .btn-success {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 0.75rem 1.25rem;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 0.9rem;
          font-family: inherit;
          font-weight: 600;
          letter-spacing: 0.01em;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
        }

        .btn-success:hover {
          background: linear-gradient(135deg, #059669 0%, #047857 100%);
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
        }

        .btn-edit {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          padding: 0.75rem 1.25rem;
          border: none;
          border-radius: 10px;
          cursor: pointer;
          font-size: 0.9rem;
          font-family: inherit;
          font-weight: 600;
          letter-spacing: 0.01em;
          transition: all 0.3s ease;
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
        }

        .btn-edit:hover {
          background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
          transform: translateY(-1px);
          box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4);
        }

        .spinner {
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          animation: spin 1s linear infinite;
          display: inline-block;
          margin-right: 0.625rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        /* Info boxes with better typography */
        .info-box {
          margin-top: 1.5rem;
          padding: 1.5rem;
          border-radius: 16px;
          font-size: 0.9rem;
          line-height: 1.7;
        }

        .info-box h4 {
          margin-bottom: 0.75rem;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        .info-box-cloudflare {
          background: linear-gradient(135deg, #f8f9ff 0%, #e8f5e8 100%);
          border-left: 4px solid #8b5cf6;
          color: #475569;
        }

        .info-box-cloudflare h4 {
          color: #8b5cf6;
        }

        .info-box-debug {
          background: #e8f4f8;
          border-left: 4px solid #2196F3;
          color: #475569;
        }

        .info-box-debug h4 {
          color: #2196F3;
        }

        .code-text {
          font-family: 'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
          font-size: 0.85rem;
          font-weight: 500;
          background: rgba(0, 0, 0, 0.05);
          padding: 0.125rem 0.375rem;
          border-radius: 4px;
          letter-spacing: 0.01em;
        }

        /* AI Message styling */
        .ai-message-box {
          background: #f8f9ff;
          border-radius: 16px;
          padding: 1.5rem;
          margin: 1.25rem 0;
          border-left: 4px solid #667eea;
          font-size: 0.95rem;
          line-height: 1.7;
        }

        .ai-message-box strong {
          font-weight: 700;
          color: #2c3e50;
          font-size: 1rem;
        }

        .ai-message-content {
          margin-top: 0.75rem;
          white-space: pre-line;
          color: #374151;
          font-weight: 500;
        }

        /* Relevance score styling */
        .relevance-score {
          text-align: right;
        }

        .relevance-badge {
          padding: 0.375rem 0.875rem;
          border-radius: 24px;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.025em;
          text-transform: uppercase;
        }

        .relevance-percentage {
          font-size: 1rem;
          font-weight: 700;
          color: #667eea;
          margin-top: 0.375rem;
        }

        @media (max-width: 768px) {
          .container {
            padding: 0 1rem;
            margin: 1rem auto;
          }
          
          .main-panel {
            padding: 1.5rem;
          }
          
          .action-buttons {
            flex-direction: column;
          }
          
          .header-content {
            flex-direction: column;
            gap: 1rem;
          }
          
          .logo {
            font-size: 1.5rem;
          }
          
          .section-title {
            font-size: 1.5rem;
          }
          
          .property-input {
            font-size: 1rem;
            padding: 1.25rem;
          }
        }
      `}</style>

      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
        {/* Header */}
        <div className="header">
          <div className="header-content">
            <div className="logo">
              🏠 PropertyAgent Pro <span className="version-badge">v2.0 CF</span>
            </div>
            <div className="user-info">
              <button className="analytics-btn" onClick={showFileAnalytics}>
                📊 Analytics
              </button>
              <div className="status-indicator">⚡ System Online</div>
              <span>Jermaine Tan - 📞 8826 6895</span>
              <div style={{ width: '44px', height: '44px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '700', fontSize: '0.9rem' }}>JT</div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="container">
          <div className="main-panel">
            <div className="section-title">✏️ Create Your Marketing Message</div>
            
            <textarea 
              id="messageInput"
              className="property-input"
              placeholder="Write your marketing message here... Examples:

• Property Listing: 'New Marina Bay luxury condo - 3BR/2BA, $2.3M, stunning bay views, immediate occupancy'

• Market Update: 'Weekly Singapore property market update: CBD condo prices up 8% this quarter, new launches showing strong demand...'

• Newsletter: 'Investment opportunities in emerging districts, rental yields holding steady at 3-4%...'

• General Content: Any property-related message you want to share with relevant leads"
            />
            
            {/* File Upload Section */}
            <div style={{ marginTop: '2rem' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '1.25rem', fontSize: '1.1rem', color: '#2c3e50' }}>📎 Attachments (Optional)</label>
              <div className="upload-area" onClick={triggerCloudflareUpload}>
                <div className="upload-icon">🎯</div>
                <div style={{ fontSize: '1.1rem', color: '#64748b', marginBottom: '1.25rem', fontWeight: '500' }}>
                  <strong style={{ color: '#2c3e50', fontWeight: '700' }}>Cloudflare Tracking Upload</strong><br />
                  <span style={{ fontSize: '0.95rem' }}>Click to upload files with tracking (Images, PDFs, Documents - Max 50MB each)</span>
                </div>
                <button className="upload-btn" onClick={triggerCloudflareUpload}>
                  🎯 Upload to Cloudflare
                </button>
              </div>
              
              {/* File Preview */}
              <div>
                {uploadedFiles.map((file, index) => (
                  <div key={index} className="file-item">
                    <div className="file-icon">{getFileIcon(file.type)}</div>
                    <div className="file-info">
                      <div>{file.name}</div>
                      <div>{formatFileSize(file.size)}</div>
                      <div style={{ background: '#8b5cf6', color: 'white', padding: '0.25rem 0.625rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', marginTop: '0.5rem', display: 'inline-block', letterSpacing: '0.025em' }}>
                        🎯 Cloudflare Tracking Active
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(index)}
                      style={{ background: '#ef4444', color: 'white', border: 'none', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontWeight: '700', fontSize: '1.1rem' }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              
              <input 
                type="file" 
                id="fileInput" 
                multiple 
                style={{ display: 'none' }} 
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,text/*"
                onChange={handleFileUpload}
              />
            </div>
            
            {/* Action Buttons */}
            <div className="action-buttons">
              <button 
                className={`btn ${isProcessing ? '' : 'btn-primary'}`}
                onClick={findMatchingLeads}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <div className="spinner"></div>
                    Finding Leads...
                  </>
                ) : (
                  <>🔍 Find Relevant Leads</>
                )}
              </button>
              <button className="btn btn-secondary" onClick={clearAll}>
                🗑️ Clear All
              </button>
            </div>

            {/* Info Box */}
            <div className="info-box info-box-cloudflare">
              <h4>🎯 Cloudflare Tracking Features:</h4>
              <div>
                • <strong>100% Tracking:</strong> Every file uploaded gets click tracking URLs<br />
                • <strong>No Cloudinary:</strong> Pure Cloudflare infrastructure for better performance<br />
                • <strong>PDF Support:</strong> Works perfectly with all document types<br />
                • <strong>Real-time Analytics:</strong> See who views your files instantly
              </div>
            </div>

            {/* Debug Info */}
            <div className="info-box info-box-debug">
              <h4>🔧 System Configuration:</h4>
              <div>
                • <strong>n8n Endpoint:</strong> <span className="code-text">{ENDPOINTS.MATCH_LEADS}</span><br />
                • <strong>Cloudflare Worker:</strong> <span className="code-text">{CONFIG.CLOUDFLARE_WORKER_URL}</span><br />
                • <strong>Agent ID:</strong> <span className="code-text">{CONFIG.AGENT_ID}</span>
              </div>
            </div>

            {/* Results Section */}
            {currentMatches.length > 0 && (
              <div style={{ marginTop: '2.5rem' }}>
                <div className="section-title">🎯 Matching Leads</div>
                <div>
                  {currentMatches.map((match, index) => (
                    <div key={index} className="lead-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1.25rem' }}>
                        <div>
                          <h3>{match.name || 'Unknown Lead'}</h3>
                          <p>📞 {match.phone || 'No phone'}</p>
                          <p>🏠 Interest: {match.propertyType || 'General'}</p>
                        </div>
                        <div className="relevance-score">
                          <span className="relevance-badge" style={{
                            background: (match.relevanceScore || 0) >= 80 ? '#ffebee' : (match.relevanceScore || 0) >= 60 ? '#fff3e0' : '#e3f2fd',
                            color: (match.relevanceScore || 0) >= 80 ? '#c62828' : (match.relevanceScore || 0) >= 60 ? '#ef6c00' : '#1565c0'
                          }}>
                            {(match.relevanceScore || 0) >= 80 ? 'HIGH' : (match.relevanceScore || 0) >= 60 ? 'MEDIUM' : 'LOW'}
                          </span>
                          <div className="relevance-percentage">
                            {match.relevanceScore || 0}%
                          </div>
                        </div>
                      </div>
                      
                      <div className="ai-message-box">
                        <strong>📱 AI-Generated Message:</strong>
                        <div className="ai-message-content">
                          {match.personalizedMessage || 'No message generated'}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button className="btn-success" onClick={() => sendWhatsAppMessage(index)}>
                          📱 Send WhatsApp
                        </button>
                        <button className="btn-edit" onClick={() => editMessage(index)}>
                          ✏️ Edit Message
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Notification */}
        {notification.show && (
          <div className={`notification ${notification.type} show`}>
            {notification.message}
          </div>
        )}
      </div>
    </>
  )
}
