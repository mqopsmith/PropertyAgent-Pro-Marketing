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
      </Head>

      <style jsx>{`
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: #333;
        }

        .header {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(15px);
          padding: 1rem 2rem;
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
          font-size: 1.5rem;
          font-weight: 700;
          color: white;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .version-badge {
          background: #8b5cf6;
          color: white;
          padding: 0.2rem 0.5rem;
          border-radius: 10px;
          font-size: 0.7rem;
          font-weight: 600;
        }

        .user-info {
          color: rgba(255, 255, 255, 0.9);
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .analytics-btn {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.3);
          padding: 0.5rem 1rem;
          border-radius: 20px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .analytics-btn:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-1px);
        }

        .status-indicator {
          padding: 0.3rem 0.8rem;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          background: rgba(46, 204, 113, 0.2);
          color: #27ae60;
          border: 1px solid rgba(46, 204, 113, 0.3);
        }

        .container {
          max-width: 1400px;
          margin: 2rem auto;
          padding: 0 2rem;
        }

        .main-panel {
          background: rgba(255, 255, 255, 0.95);
          border-radius: 16px;
          padding: 2rem;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        }

        .section-title {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
          color: #2c3e50;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .property-input {
          width: 100%;
          min-height: 120px;
          padding: 1.5rem;
          border: 2px solid #e8f2ff;
          border-radius: 12px;
          font-size: 1rem;
          outline: none;
          transition: border-color 0.3s ease;
          resize: vertical;
          font-family: inherit;
        }

        .property-input:focus {
          border-color: #667eea;
        }

        .upload-area {
          border: 3px dashed #8b5cf6;
          border-radius: 15px;
          padding: 40px;
          text-align: center;
          transition: all 0.3s ease;
          background: linear-gradient(135deg, #f8f9ff 0%, #e8f5e8 100%);
          margin: 20px 0;
          cursor: pointer;
        }

        .upload-area:hover {
          border-color: #667eea;
          background: linear-gradient(135deg, #e8f5e8 0%, #f8f9ff 100%);
          transform: scale(1.02);
        }

        .upload-icon {
          width: 60px;
          height: 60px;
          background: #8b5cf6;
          border-radius: 50%;
          margin: 0 auto 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 24px;
        }

        .upload-btn {
          background: linear-gradient(135deg, #8b5cf6 0%, #667eea 100%);
          color: white;
          padding: 12px 24px;
          border: none;
          border-radius: 25px;
          cursor: pointer;
          font-size: 1rem;
          transition: all 0.3s ease;
          font-weight: 600;
        }

        .upload-btn:hover {
          background: linear-gradient(135deg, #7c3aed 0%, #5a6fd8 100%);
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(139, 92, 246, 0.3);
        }

        .file-item {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 15px;
          background: linear-gradient(135deg, #f8f9ff 0%, #e8f5e8 100%);
          border-radius: 10px;
          margin-bottom: 10px;
          border: 2px solid #8b5cf6;
        }

        .file-icon {
          width: 40px;
          height: 40px;
          background: #8b5cf6;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: bold;
        }

        .file-info {
          flex: 1;
        }

        .btn {
          padding: 0.8rem 1.5rem;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.3s ease;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
        }

        .btn-secondary {
          background: #6c757d;
          color: white;
        }

        .btn:disabled {
          background: #95a5a6;
          cursor: not-allowed;
          transform: none;
        }

        .lead-card {
          background: white;
          border-radius: 12px;
          padding: 1.5rem;
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
          border: 2px solid #e8f2ff;
          transition: all 0.3s ease;
          margin-bottom: 1.5rem;
        }

        .lead-card:hover {
          border-color: #667eea;
          transform: translateY(-2px);
        }

        .notification {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 1rem 1.5rem;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          z-index: 1000;
          transform: translateX(400px);
          transition: transform 0.3s ease;
        }

        .notification.show {
          transform: translateX(0);
        }

        .notification.success { background: #27ae60; }
        .notification.error { background: #e74c3c; }
        .notification.info { background: #3498db; }

        .action-buttons {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .btn-success {
          background: #27ae60;
          color: white;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .btn-success:hover {
          background: #219a52;
          transform: translateY(-1px);
        }

        .btn-edit {
          background: #f39c12;
          color: white;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 600;
          transition: all 0.3s ease;
        }

        .btn-edit:hover {
          background: #d68910;
          transform: translateY(-1px);
        }

        .spinner {
          border: 2px solid #f3f3f3;
          border-top: 2px solid #667eea;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          animation: spin 1s linear infinite;
          display: inline-block;
          margin-right: 0.5rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .container {
            padding: 0 1rem;
          }
          .action-buttons {
            flex-direction: column;
          }
          .header-content {
            flex-direction: column;
            gap: 1rem;
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
              <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: '600' }}>JT</div>
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
            <div style={{ marginTop: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '1rem' }}>📎 Attachments (Optional)</label>
              <div className="upload-area" onClick={triggerCloudflareUpload}>
                <div className="upload-icon">🎯</div>
                <div style={{ fontSize: '1.1rem', color: '#666', marginBottom: '15px' }}>
                  <strong>Cloudflare Tracking Upload</strong><br />
                  <small>Click to upload files with tracking (Images, PDFs, Documents - Max 50MB each)</small>
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
                      <div style={{ fontWeight: '500', color: '#333' }}>{file.name}</div>
                      <div style={{ fontSize: '0.9rem', color: '#666' }}>{formatFileSize(file.size)}</div>
                      <div style={{ background: '#8b5cf6', color: 'white', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '600', marginTop: '5px', display: 'inline-block' }}>
                        🎯 Cloudflare Tracking Active
                      </div>
                    </div>
                    <button 
                      onClick={() => removeFile(index)}
                      style={{ background: '#f44336', color: 'white', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer' }}
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
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'linear-gradient(135deg, #f8f9ff 0%, #e8f5e8 100%)', borderRadius: '8px', borderLeft: '3px solid #8b5cf6' }}>
              <h4 style={{ color: '#8b5cf6', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600' }}>🎯 Cloudflare Tracking Features:</h4>
              <div style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.6' }}>
                • <strong>100% Tracking:</strong> Every file uploaded gets click tracking URLs<br />
                • <strong>No Cloudinary:</strong> Pure Cloudflare infrastructure for better performance<br />
                • <strong>PDF Support:</strong> Works perfectly with all document types<br />
                • <strong>Real-time Analytics:</strong> See who views your files instantly
              </div>
            </div>

            {/* Debug Info */}
            <div style={{ marginTop: '1rem', padding: '1rem', background: '#e8f4f8', borderRadius: '8px', borderLeft: '3px solid #2196F3' }}>
              <h4 style={{ color: '#2196F3', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: '600' }}>🔧 System Configuration:</h4>
              <div style={{ fontSize: '0.85rem', color: '#666', lineHeight: '1.6' }}>
                • <strong>n8n Endpoint:</strong> {ENDPOINTS.MATCH_LEADS}<br />
                • <strong>Cloudflare Worker:</strong> {CONFIG.CLOUDFLARE_WORKER_URL}<br />
                • <strong>Agent ID:</strong> {CONFIG.AGENT_ID}
              </div>
            </div>

            {/* Results Section */}
            {currentMatches.length > 0 && (
              <div style={{ marginTop: '2rem' }}>
                <div className="section-title">🎯 Matching Leads</div>
                <div>
                  {currentMatches.map((match, index) => (
                    <div key={index} className="lead-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                        <div>
                          <h3 style={{ fontWeight: '600', color: '#2c3e50' }}>{match.name || 'Unknown Lead'}</h3>
                          <p style={{ fontSize: '0.9rem', color: '#666' }}>📞 {match.phone || 'No phone'}</p>
                          <p style={{ fontSize: '0.9rem', color: '#666' }}>🏠 Interest: {match.propertyType || 'General'}</p>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            padding: '0.3rem 0.8rem',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            background: (match.relevanceScore || 0) >= 80 ? '#ffebee' : (match.relevanceScore || 0) >= 60 ? '#fff3e0' : '#e3f2fd',
                            color: (match.relevanceScore || 0) >= 80 ? '#c62828' : (match.relevanceScore || 0) >= 60 ? '#ef6c00' : '#1565c0'
                          }}>
                            {(match.relevanceScore || 0) >= 80 ? 'HIGH' : (match.relevanceScore || 0) >= 60 ? 'MEDIUM' : 'LOW'}
                          </span>
                          <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#667eea', marginTop: '0.25rem' }}>
                            {match.relevanceScore || 0}%
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ background: '#f8f9ff', borderRadius: '8px', padding: '1rem', margin: '1rem 0', borderLeft: '3px solid #667eea' }}>
                        <strong>📱 AI-Generated Message:</strong>
                        <div style={{ marginTop: '0.5rem', whiteSpace: 'pre-line', fontSize: '0.9rem' }}>
                          {match.personalizedMessage || 'No message generated'}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
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
