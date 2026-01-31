import React, { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { Camera, Upload, CheckCircle, XCircle, RefreshCw, FileCode, AlertTriangle } from 'lucide-react';

const CameraReader = () => {
  // --- Eyalet Yönetimi ---
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [jsonTemplate, setJsonTemplate] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // --- 1. JSON Dosyası Yükleme İşlevi ---
  const handleJsonUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        setJsonTemplate(parsed);
        setProcessedData(null);
        alert("✅ JSON Şablonu yüklendi! Şimdi kamerayı açabilirsiniz.");
      } catch (err) {
        alert("❌ Geçersiz JSON dosyası!");
      }
    };
    reader.readAsText(file);
  };

  // --- 2. Kamera İzni İsteme Uyarısı ---
  const requestCameraPermission = () => {
    setShowPermissionModal(true);
  };

  // --- 3. Canlı Kamera Başlatma ve İzin Yönetimi ---
  const startCamera = async () => {
    setShowPermissionModal(false);
    setCameraError(null);
    
    try {
      // Tarayıcıdan kamera izni istenir
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Video yüklenene kadar bekle
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            resolve();
          };
        });
        
        setIsCameraActive(true);
      }
    } catch (err) {
      console.error("Kamera erişim hatası:", err);
      
      let errorMsg = "Kameraya erişilemedi.";
      if (err.name === 'NotAllowedError') {
        errorMsg = "❌ Kamera izni reddedildi. Lütfen tarayıcı ayarlarından (kilit simgesi) izin verip sayfayı yenileyin.";
      } else if (err.name === 'NotFoundError') {
        errorMsg = "❌ Cihazınızda kamera bulunamadı.";
      } else if (err.name === 'NotReadableError') {
        errorMsg = "❌ Kamera başka bir uygulama tarafından kullanılıyor.";
      } else if (err.name === 'OverconstrainedError') {
        errorMsg = "❌ Kamera ayarları desteklenmiyor.";
      } else if (err.name === 'SecurityError') {
        errorMsg = "❌ Güvenlik nedeniyle kameraya erişilemiyor. HTTPS kullandığınızdan emin olun.";
      }
      
      setCameraError(errorMsg);
      alert(errorMsg);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  // --- 4. Görüntü İşleme (OMR & OCR) ---
  const captureAndProcess = async () => {
    if (!jsonTemplate) {
      alert("Lütfen önce bir JSON şablonu yükleyin!");
      return;
    }

    setIsProcessing(true);
    try {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const results = {
        answers: {},
        ocrResults: {}
      };

      if (jsonTemplate.ocr_areas) {
        for (const area of jsonTemplate.ocr_areas) {
          const text = await performOCR(canvas, area);
          results.ocrResults[area.label || 'Alan'] = text;
        }
      }

      if (jsonTemplate.answer_bubbles) {
        jsonTemplate.answer_bubbles.forEach(bubble => {
          const isFilled = checkBubbleFilled(ctx, bubble.x, bubble.y, bubble.radius || 10);
          if (isFilled) {
            results.answers[bubble.question] = bubble.option;
          }
        });
      }

      setProcessedData(results);
    } catch (error) {
      alert("İşleme sırasında bir hata oluştu: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const checkBubbleFilled = (ctx, x, y, radius) => {
    const imageData = ctx.getImageData(x - radius, y - radius, radius * 2, radius * 2);
    const pixels = imageData.data;
    let darkPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i], g = pixels[i+1], b = pixels[i+2];
      const brightness = (r + g + b) / 3;
      if (brightness < 110) darkPixels++;
    }
    const fillRate = darkPixels / (pixels.length / 4);
    return fillRate > 0.35;
  };

  const performOCR = async (sourceCanvas, area) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = area.w;
    tempCanvas.height = area.h;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(sourceCanvas, area.x, area.y, area.w, area.h, 0, 0, area.w, area.h);
    
    const { data: { text } } = await Tesseract.recognize(tempCanvas.toDataURL(), 'tur');
    return text.trim();
  };

  return (
    <div className="p-4 max-w-4xl mx-auto bg-gray-50 min-h-screen font-sans text-gray-800">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        {/* Başlık */}
        <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Camera size={28} /> Akıllı Form Okuyucu
          </h1>
          {isCameraActive && (
            <span className="flex items-center gap-2 text-sm bg-blue-700 px-3 py-1 rounded-full animate-pulse">
              <div className="w-2 h-2 bg-green-400 rounded-full"></div> Canlı Yayın
            </span>
          )}
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* JSON Yükleme Bölümü */}
            <div className={`p-6 border-2 border-dashed rounded-xl transition-colors ${jsonTemplate ? 'border-green-400 bg-green-50' : 'border-gray-300 bg-gray-50'}`}>
              <label className="flex flex-col items-center cursor-pointer text-center">
                <FileCode size={40} className={jsonTemplate ? 'text-green-500' : 'text-gray-400'} />
                <span className="mt-2 font-semibold text-gray-700">JSON Şablonu Yükle</span>
                <p className="text-xs text-gray-500 mt-1">Koordinat verilerini içeren dosyayı seçin</p>
                <input type="file" accept=".json" onChange={handleJsonUpload} className="hidden" />
              </label>
              {jsonTemplate && (
                <div className="mt-3 text-center text-sm font-medium text-green-700">
                  ✓ {jsonTemplate.template_info?.title || "Şablon Hazır"}
                </div>
              )}
            </div>

            {/* Kamera Aç/Kapat Butonu */}
            <div className="flex flex-col justify-center gap-3">
              {!isCameraActive ? (
                <button 
                  onClick={requestCameraPermission}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg transition-all transform hover:scale-[1.02]"
                >
                  <Camera size={24} /> Kamerayı Başlat
                </button>
              ) : (
                <button 
                  onClick={stopCamera}
                  className="w-full bg-red-500 hover:bg-red-600 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 shadow-lg transition-all"
                >
                  <XCircle size={24} /> Kamerayı Durdur
                </button>
              )}
              {cameraError && (
                <div className="flex items-start gap-2 text-red-600 text-sm mt-2 p-3 bg-red-50 rounded-lg border border-red-200">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Kamera İzni Modal Uyarısı */}
          {showPermissionModal && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-in fade-in">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in slide-in-from-bottom-4">
                <div className="flex items-center justify-center mb-6">
                  <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center">
                    <Camera size={40} className="text-blue-600" />
                  </div>
                </div>
                
                <h2 className="text-2xl font-bold text-gray-800 text-center mb-4">
                  Kamera İzni Gerekiyor
                </h2>
                
                <p className="text-gray-600 text-center mb-6 leading-relaxed">
                  Form okuyucunun çalışabilmesi için cihazınızın kamerasına erişim izni vermeniz gerekmektedir.
                </p>
                
                <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6 rounded">
                  <p className="text-sm text-blue-800">
                    <strong>📷 Tarayıcınız bir izin penceresi gösterecektir.</strong><br/>
                    "İzin Ver" veya "Allow" butonuna tıklayarak devam edin.
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowPermissionModal(false)}
                    className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-xl transition-colors"
                  >
                    İptal
                  </button>
                  <button
                    onClick={startCamera}
                    className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={20} /> İzin Ver
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Canlı Kamera Alanı */}
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-video shadow-2xl border-4 border-gray-200">
            {isCameraActive ? (
              <>
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="w-[85%] h-[80%] border-2 border-dashed border-white/60 rounded-lg flex items-center justify-center">
                    <div className="bg-black/40 text-white text-[10px] px-2 py-1 rounded uppercase tracking-widest">
                      Formu Buraya Hizalayın
                    </div>
                  </div>
                </div>

                <button 
                  onClick={captureAndProcess}
                  disabled={isProcessing}
                  className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-8 py-4 rounded-full shadow-2xl flex items-center gap-3 font-bold text-white transition-all ${isProcessing ? 'bg-gray-500 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600 scale-110 active:scale-95'}`}
                >
                  {isProcessing ? (
                    <><RefreshCw className="animate-spin" /> İşleniyor...</>
                  ) : (
                    <><Scan size={24} /> Formu Tara ve Oku</>
                  )}
                </button>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-4">
                <Webcam size={64} className="opacity-20" />
                <p>Kamera şu an kapalı</p>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {/* Okuma Sonuçları */}
          {processedData && (
            <div className="mt-8 p-6 bg-white rounded-xl border-2 border-blue-100 shadow-sm animate-in fade-in slide-in-from-bottom-4">
              <h2 className="text-xl font-bold text-blue-800 border-b pb-3 mb-4 flex items-center gap-2">
                <CheckCircle className="text-green-500" /> Okuma Başarılı
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-bold text-gray-500 uppercase text-xs tracking-wider mb-3">Metin Alanları (OCR)</h3>
                  <div className="space-y-2">
                    {Object.entries(processedData.ocrResults).map(([key, val]) => (
                      <div key={key} className="flex justify-between p-3 bg-gray-50 rounded-lg border border-gray-100">
                        <span className="font-medium text-gray-600">{key}:</span>
                        <span className="font-bold text-blue-700">{val || "Okunamadı"}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-bold text-gray-500 uppercase text-xs tracking-wider mb-3">İşaretlenen Cevaplar</h3>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(processedData.answers).length > 0 ? (
                      Object.entries(processedData.answers).map(([q, a]) => (
                        <div key={q} className="bg-blue-50 text-blue-700 px-3 py-2 rounded-md border border-blue-100 text-sm">
                          <span className="font-bold mr-1">{q}:</span> {a}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-gray-400 italic">Hiçbir işaretleme tespit edilemedi.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const Scan = ({ size, className }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>;
const Webcam = ({ size, className }) => <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="10" r="8"/><circle cx="12" cy="10" r="3"/><path d="M7 22h10"/><path d="M12 22v-4"/></svg>;

export default CameraReader;
