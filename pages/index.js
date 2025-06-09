import Head from 'next/head'
import { useState, useEffect } from 'react'

export default function PropertyAgentPro() {
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [currentMatches, setCurrentMatches] = useState([])
  const [notification, setNotification] = useState({ message: '', type: '', show: false })

  // Configuration - CLOUDFLARE ONLY
  const CONFIG = {
    N8N_BASE_URL: process.env.NEXT_PUBLIC_N8N_URL || 'https://n8n.opsmith.biz/webhook',
    AGENT_ID: process.env.NEXT_PUBLIC_AGENT_ID || 'sarah-lim-001',
    CLOUDFLARE_WORKER_URL: process.env.NEXT_PUBLIC_CLOUDFLARE_WORKER_URL || 'https://propertyagent-pro-tracker.mingquan.workers.dev'
  }

  const ENDPOINTS = {
    MATCH_LEADS: CONFIG.N8N_BASE_URL + '/match-leads',
    SEND_MESSAGE: CONFIG.N8N_BASE_URL + '/send-message'
  }

  useEffect(() => {
    console.log('🎯 PropertyAgent Pro v2.0 Cloudflare-Only Initialized')
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
      uploadMethod: 'cloudflare'
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
      const requestPayload = {
        body: {
          action: 'match_leads',
          messageContent: messageContent,
          agentId: CONFIG.AGENT_ID,
          uploadedFiles: uploadedFiles.map(file => ({
            name: file.name,
            type: file.type,
            size: file.size,
            cloudinaryUrl: file.trackingUrl,
            publicId: file.trackingId,
            trackingUrl: file.trackingUrl,
            trackingId: file.trackingId,
            uploadMethod: 'cloudflare'
          }))
        }
      }

      const response = await fetch(ENDPOINTS.MATCH_LEADS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      })

      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText)
      }

      const responseText = await response.text()
      
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

  return (
    <>
      <Head>
        <title>PropertyAgent Pro - Cloudflare v2.0</title>
        <meta name="description" content="PropertyAgent Pro WhatsApp Marketing Automation" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500">
        {/* Header */}
        <div className="bg-white/10 backdrop-blur-md border-b border-white/20 p-4">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2 text-white">
              <span className="text-2xl font-bold">🏠 PropertyAgent Pro</span>
              <span className="bg-purple-600 text-white px-2 py-1 rounded-full text-xs font-semibold">
                v2.0 CF
              </span>
            </div>
            <div className="flex items-center gap-4 text-white/90">
              <button 
                onClick={showFileAnalytics}
                className="bg-white/20 hover:bg-white/30 border border-white/30 px-4 py-2 rounded-full text-sm font-semibold transition-all"
              >
                📊 Analytics
              </button>
              <div className="bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-1 rounded-full text-xs font-semibold">
                ⚡ System Online
              </div>
              <span>Sarah Lim - ERA Singapore</span>
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center font-semibold">
                SL
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto p-8">
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-8 shadow-2xl">
            {/* Message Input Section */}
            <div className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
                ✏️ Create Your Message
              </h2>
              
              <textarea 
                id="messageInput"
                className="w-full min-h-32 p-6 border-2 border-blue-100 rounded-xl text-base outline-none transition-colors resize-y font-sans"
                style={{ borderColor: '#e8f2ff' }}
                onFocus={(e) => e.target.style.borderColor = '#667eea'}
                onBlur={(e) => e.target.style.borderColor = '#e8f2ff'}
                placeholder="Write your message here... This could be:

• Property Listing: 'New Marina Bay luxury condo - 3BR/2BA, $2.3M, stunning bay views, immediate occupancy'

• Market Update: 'Weekly Singapore property market update: CBD condo prices up 8% this quarter, new launches showing strong demand...'

• Newsletter: 'Investment opportunities in emerging districts, rental yields holding steady at 3-4%...'

• General Content: Any property-related message you want to share with relevant leads"
              />
              
              {/* File Upload Section */}
              <div className="mt-6">
                <label className="block font-semibold mb-4">📎 Attachments (Optional)</label>
                <div 
                  className="border-3 border-dashed border-purple-400 rounded-2xl p-10 text-center transition-all cursor-pointer"
                  style={{ 
                    background: 'linear-gradient(135deg, #f8f9ff 0%, #e8f5e8 100%)',
                    borderColor: '#8b5cf6',
                    borderWidth: '3px'
                  }}
                  onClick={triggerCloudflareUpload}
                  onMouseEnter={(e) => {
                    e.target.style.borderColor = '#667eea'
                    e.target.style.background = 'linear-gradient(135deg, #e8f5e8 0%, #f8f9ff 100%)'
                    e.target.style.transform = 'scale(1.02)'
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = '#8b5cf6'
                    e.target.style.background = 'linear-gradient(135deg, #f8f9ff 0%, #e8f5e8 100%)'
                    e.target.style.transform = 'scale(1)'
                  }}
                >
                  <div className="w-15 h-15 bg-purple-600 rounded-full mx-auto mb-5 flex items-center justify-center text-white text-2xl" style={{ width: '60px', height: '60px' }}>
                    🎯
                  </div>
                  <div className="text-lg text-gray-600 mb-4">
                    <strong>Cloudflare Tracking Upload</strong><br />
                    <small>Click to upload files with tracking (Images, PDFs, Documents - Max 50MB each)</small>
                  </div>
                  <button 
                    type="button" 
                    className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-3 rounded-full font-semibold transition-all hover:from-purple-700 hover:to-indigo-700 hover:-translate-y-0.5 hover:shadow-lg"
                    onClick={triggerCloudflareUpload}
                  >
                    🎯 Upload to Cloudflare
                  </button>
                </div>
                
                {/* File Preview */}
                <div className="mt-5">
                  {uploadedFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl mb-3 border-2 border-purple-400">
                      <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center text-white font-bold">
                        {getFileIcon(file.type)}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-gray-800">{file.name}</div>
                        <div className="text-sm text-gray-600">{formatFileSize(file.size)}</div>
                        <div className="bg-purple-600 text-white px-3 py-1 rounded-md text-xs font-semibold mt-2 inline-flex items-center gap-2">
                          🎯 Cloudflare Tracking Active
                        </div>
                      </div>
                      <button 
                        onClick={() => removeFile(index)}
                        className="bg-red-500 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
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
              <div className="flex gap-4 mt-6">
                <button 
                  className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2 ${
                    isProcessing 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:-translate-y-0.5 hover:shadow-lg'
                  }`}
                  onClick={findMatchingLeads}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Finding Leads...
                    </>
                  ) : (
                    <>🔍 Find Relevant Leads</>
                  )}
                </button>
                <button 
                  className="bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition-all hover:bg-gray-700"
                  onClick={clearAll}
                >
                  🗑️ Clear All
                </button>
              </div>

              {/* Info Box */}
              <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border-l-4 border-purple-600">
                <h4 className="text-purple-600 font-semibold text-sm mb-2">🎯 Cloudflare Tracking Features:</h4>
                <div className="text-sm text-gray-600 leading-relaxed">
                  • <strong>100% Tracking:</strong> Every file uploaded gets click tracking URLs<br />
                  • <strong>No Cloudinary:</strong> Pure Cloudflare infrastructure for better performance<br />
                  • <strong>PDF Support:</strong> Works perfectly with all document types<br />
                  • <strong>Real-time Analytics:</strong> See who views your files instantly
                </div>
              </div>
            </div>

            {/* Results Section */}
            {currentMatches.length > 0 && (
              <div className="mt-8">
                <h2 className="text-2xl font-semibold text-gray-800 mb-6">🎯 Matching Leads</h2>
                <div className="grid gap-6">
                  {currentMatches.map((match, index) => (
                    <div key={index} className="bg-white rounded-xl p-6 shadow-lg border-2 border-blue-100">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-gray-800">{match.name || 'Unknown Lead'}</h3>
                          <p className="text-sm text-gray-600">📞 {match.phone || 'No phone'}</p>
                          <p className="text-sm text-gray-600">🏠 Interest: {match.propertyType || 'General'}</p>
                        </div>
                        <div className="text-right">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            (match.relevanceScore || 0) >= 80 ? 'bg-red-100 text-red-800' :
                            (match.relevanceScore || 0) >= 60 ? 'bg-orange-100 text-orange-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {(match.relevanceScore || 0) >= 80 ? 'HIGH' :
                             (match.relevanceScore || 0) >= 60 ? 'MEDIUM' : 'LOW'}
                          </span>
                          <div className="text-sm font-semibold text-indigo-600 mt-1">
                            {match.relevanceScore || 0}%
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-blue-50 rounded-lg p-4 mb-4">
                        <strong>📱 AI-Generated Message:</strong>
                        <div className="mt-2 whitespace-pre-line text-sm">
                          {match.personalizedMessage || 'No message generated'}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors">
                          📱 Send WhatsApp
                        </button>
                        <button className="bg-orange-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors">
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
          <div className={`fixed top-5 right-5 px-6 py-4 rounded-lg text-white font-semibold z-50 transition-transform ${
            notification.type === 'success' ? 'bg-green-500' :
            notification.type === 'error' ? 'bg-red-500' : 'bg-blue-500'
          } ${notification.show ? 'translate-x-0' : 'translate-x-full'}`}>
            {notification.message}
          </div>
        )}
      </div>
    </>
  )
}
