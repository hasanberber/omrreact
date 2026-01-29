// App.js
import React, { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import { 
  Upload, FileText, Image as ImageIcon, CheckCircle, XCircle, 
  AlertCircle, Edit, Settings, Eye, Key, Download, Copy, 
  Trash2, Plus, Minus, Save, User, Users, BookOpen, Circle, 
  MousePointer, Camera, Scan, QrCode, Webcam, Grid3x3, Pencil,
  Loader2, Printer, RotateCw
} from 'lucide-react';

// PDF oluşturmak için html2canvas ve jsPDF
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const CombinedOMRApp = () => {
  // Uygulama modu: 'generator' veya 'reader'
  const [appMode, setAppMode] = useState('generator');
  
  // ============ FORM ÜRETİCİ BÖLÜMÜ ============
  const loadSavedSettings = () => {
    const saved = localStorage.getItem('omrFormSettings');
    if (saved) {
      return JSON.parse(saved);
    }
    
    return {
      title: "Sınav Formu",
      questionCount: 20,
      optionCount: 5,
      studentDigits: 4,
      columnCount: 2,
      columnGap: 150,
      radius: 8,
      lineWidth: 1,
      rowGap: 25,
      studentHGap: 40,
      studentVGap: 25,
      optionHGap: 30,
      color: "#000000",
      startX: 100,
      startY: 300,
      studentX: 100,
      studentY: 200,
      includeName: true,
      includeClass: true,
      collisionPrevention: true,
      scorePerCorrect: 5,
      questionColumns: 2,
      questionColumnGap: 150,
      bubbleRowGap: 25,
      bubbleColumnGap: 30,
      studentBubbleRowGap: 25,
      studentBubbleColumnGap: 40,
      questionNumberGap: 40,
      bubbleSize: 16,
      studentNameGap: 50,
      // YENİ EKLENEN ÖĞRENCİ NUMARASI AYARLARI
      studentNumberSettings: {
        labelX: 100,
        labelY: 200,
        bubblesX: 100,
        bubblesY: 220,
        labelGap: 20,
        bubbleRadius: 8,
        labelText: "ÖĞRENCİ NO:"
      }
    };
  };

  const [formSettings, setFormSettings] = useState(loadSavedSettings());
  
  // Ad soyad ve sınıf için state
  const [studentInfo, setStudentInfo] = useState({
    name: "",
    surname: "",
    className: ""
  });

  const [answerKey, setAnswerKey] = useState({});
  const [answerKeyInputs, setAnswerKeyInputs] = useState({});
  const [showAnswerKeyDialog, setShowAnswerKeyDialog] = useState(false);
  const [generatedForm, setGeneratedForm] = useState(null);
  const [generatedJson, setGeneratedJson] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [processingResults, setProcessingResults] = useState(null);
  
  // Baloncuk tıklama özelliği için
  const [clickableMode, setClickableMode] = useState(false);
  const [selectedBubbles, setSelectedBubbles] = useState({});

  const A4_WIDTH_PX = 1240;
  const A4_HEIGHT_PX = 1754;

  // Form önizlemesi için canvas referansı
  const previewCanvasRef = useRef(null);

  // ============ FORM OKUYUCU BÖLÜMÜ ============
  const [studentForm, setStudentForm] = useState(null);
  const [jsonTemplate, setJsonTemplate] = useState(null);
  const [answerKeyForm, setAnswerKeyForm] = useState(null);
  const [activeTab, setActiveTab] = useState('student');
  const [results, setResults] = useState([]);
  const [processedData, setProcessedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useSameFormForAnswerKey, setUseSameFormForAnswerKey] = useState(false);

  // KAMERA ÖZELLİKLERİ
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraImage, setCameraImage] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [alignmentStatus, setAlignmentStatus] = useState('waiting');
  const [cameraFrameColor, setCameraFrameColor] = useState('border-gray-400');
  const [showAlignmentGrid, setShowAlignmentGrid] = useState(true);
  const [detectedCorners, setDetectedCorners] = useState([]);

  // OCR okuma durumu için state
  const [ocrData, setOcrData] = useState({
    name: "",
    surname: "",
    className: ""
  });

  // Düzenleme modu için state
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState({
    studentId: "",
    name: "",
    surname: "",
    className: "",
    answers: {}
  });

  // OCR işleme durumu
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);

  const studentFormRef = useRef(null);
  const jsonTemplateRef = useRef(null);
  const answerKeyRef = useRef(null);
  const videoRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const previewContainerRef = useRef(null);

  // Ayarları localStorage'a otomatik kaydet
  const saveSettingsToLocalStorage = () => {
    localStorage.setItem('omrFormSettings', JSON.stringify(formSettings));
    localStorage.setItem('omrStudentInfo', JSON.stringify(studentInfo));
    localStorage.setItem('omrAnswerKey', JSON.stringify(answerKey));
  };

  // Formları kaydet
  const saveForms = () => {
    const formData = {
      formSettings,
      studentInfo,
      answerKey,
      generatedForm,
      generatedJson,
      timestamp: new Date().toISOString()
    };
    
    const dataStr = JSON.stringify(formData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `omr-form-data-${new Date().getTime()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
    
    addResult('✓ Form ve cevap anahtarı kaydedildi.', 'success');
  };

  // PDF çıktı al
  const exportToPDF = async () => {
    if (!previewImage) {
      alert('Lütfen önce form oluşturun!');
      return;
    }

    addResult('📄 PDF oluşturuluyor...', 'info');
    
    try {
      // html2canvas kullanarak element'i capture et
      const container = previewContainerRef.current;
      if (!container) return;
      
      const canvas = await html2canvas(container.querySelector('img') || container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FFFFFF'
      });
      
      // PDF oluştur
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      // Canvas'tan data URL al
      const imgData = canvas.toDataURL('image/png');
      
      // PDF boyutları
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Görsel boyutlarını hesapla
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = imgWidth / imgHeight;
      
      // PDF'e sığdır
      let finalWidth = pdfWidth;
      let finalHeight = pdfWidth / ratio;
      
      if (finalHeight > pdfHeight) {
        finalHeight = pdfHeight;
        finalWidth = pdfHeight * ratio;
      }
      
      // Ortala
      const x = (pdfWidth - finalWidth) / 2;
      const y = (pdfHeight - finalHeight) / 2;
      
      // PDF'e ekle
      pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight);
      
      // İndir
      pdf.save(`omr-form-${formSettings.title.replace(/\s+/g, '-').toLowerCase()}.pdf`);
      
      addResult('✓ PDF başarıyla indirildi.', 'success');
      
    } catch (error) {
      console.error('PDF oluşturma hatası:', error);
      addResult('❌ PDF oluşturulamadı: ' + error.message, 'error');
    }
  };

  // Uygulama açıldığında kaydedilmiş verileri yükle
  useEffect(() => {
    const savedStudentInfo = localStorage.getItem('omrStudentInfo');
    const savedAnswerKey = localStorage.getItem('omrAnswerKey');
    
    if (savedStudentInfo) {
      setStudentInfo(JSON.parse(savedStudentInfo));
    }
    
    if (savedAnswerKey) {
      const parsedAnswerKey = JSON.parse(savedAnswerKey);
      setAnswerKey(parsedAnswerKey);
      setAnswerKeyInputs(parsedAnswerKey);
      
      // Seçili baloncukları güncelle
      const newSelectedBubbles = {};
      Object.entries(parsedAnswerKey).forEach(([questionNum, answer]) => {
        if (answer && answer !== '-' && answer !== 'X') {
          newSelectedBubbles[`${questionNum}_${answer}`] = true;
        }
      });
      setSelectedBubbles(newSelectedBubbles);
      
      // Formu yeniden oluştur
      setTimeout(() => generatePreview(), 100);
    }
  }, []);

  // Form ayarları veya öğrenci bilgileri değiştiğinde otomatik kaydet ve önizleme oluştur
  useEffect(() => {
    if (appMode === 'generator') {
      saveSettingsToLocalStorage();
      generatePreview();
    }
  }, [
    formSettings,
    answerKey,
    studentInfo,
    appMode
  ]);

  // Bileşen unmount olduğunda kamerayı kapat
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [cameraStream]);

  // ============ GÜNCELLENMİŞ KAMERA FONKSİYONLARI ============
  const startCamera = async () => {
    try {
      // Kullanıcıdan kamera izni iste
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      setCameraStream(stream);
      setIsCameraActive(true);
      setActiveTab('camera');
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      if (videoRef.current) {
        videoRef.current.onloadedmetadata = () => {
          startScanning();
        };
      }
      
    } catch (error) {
      console.error('Kamera açılamadı:', error);
      
      // Detaylı hata mesajı
      let errorMessage = 'Kamera erişimi reddedildi veya kamera bulunamadı.';
      let errorDetails = '';
      
      if (error.name === 'NotAllowedError') {
        errorMessage = '📷 Kamera erişimi reddedildi!';
        errorDetails = 'Lütfen tarayıcınızın kamera iznini etkinleştirin.';
      } else if (error.name === 'NotFoundError') {
        errorMessage = '📷 Kamera bulunamadı!';
        errorDetails = 'Lütfen cihazınızda bir kamera olduğundan emin olun.';
      } else if (error.name === 'NotReadableError') {
        errorMessage = '📷 Kamera kullanımda!';
        errorDetails = 'Kamera başka bir uygulama tarafından kullanılıyor olabilir.';
      } else if (error.name === 'OverconstrainedError') {
        errorMessage = '📷 Kamera özellikleri uygun değil!';
        errorDetails = 'İstenen kamera özellikleri mevcut değil.';
      }
      
      // Kullanıcıya detaylı hata mesajı göster
      const userConfirmed = window.confirm(
        `${errorMessage}\n\n${errorDetails}\n\n` +
        'Kamera iznini vermek için:\n' +
        '1. Tarayıcınızın adres çubuğundaki 🔒 (kilit) simgesine tıklayın\n' +
        '2. "Site ayarları" veya "İzinler" bölümüne girin\n' +
        '3. Kamera iznini "İzin ver" olarak değiştirin\n' +
        '4. Sayfayı yenileyin\n\n' +
        'Kamerayı kullanmak istiyor musunuz?'
      );
      
      // Kullanıcı onay verirse, tarayıcı izin ayarlarını açmaya çalış
      if (userConfirmed) {
        try {
          // Tarayıcı izin ayarlarına yönlendirme (modern tarayıcılar için)
          if (navigator.permissions) {
            // Permissions API'yi kullanarak izin durumunu kontrol et
            const permissionStatus = await navigator.permissions.query({ name: 'camera' });
            
            permissionStatus.onchange = () => {
              console.log('Kamera izin durumu değişti:', permissionStatus.state);
              if (permissionStatus.state === 'granted') {
                // İzin verildiyse, sayfayı yenile
                window.location.reload();
              }
            };
          }
          
          // Kullanıcıyı tarayıcı ayarlarına yönlendir
          alert(
            'Tarayıcı ayarlarınıza gidin ve kamera iznini etkinleştirin.\n\n' +
            'Chrome: chrome://settings/content/camera\n' +
            'Edge: edge://settings/content/camera\n' +
            'Firefox: about:preferences#privacy > Kamera\n\n' +
            'Ayarları yaptıktan sonra sayfayı yenileyin.'
          );
          
        } catch (settingsError) {
          console.error('Ayarlara yönlendirme hatası:', settingsError);
        }
      }
      
      // Hata mesajını sonuçlara ekle
      addResult(`❌ ${errorMessage} ${errorDetails ? `(${errorDetails})` : ''}`, 'error');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
    setCameraImage(null);
    setIsScanning(false);
    setAlignmentStatus('waiting');
    setCameraFrameColor('border-gray-400');
    setDetectedCorners([]);
    
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
  };

  const captureImage = () => {
    if (!videoRef.current || !cameraCanvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = cameraCanvasRef.current;
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    const imageData = canvas.toDataURL('image/png');
    setCameraImage(imageData);
    
    const imageFile = {
      name: 'kamera-goruntusu.png',
      data: imageData,
      type: 'image/png'
    };
    
    setStudentForm(imageFile);
    setActiveTab('student');
    addResult('📸 Kamera görüntüsü yakalandı ve öğrenci formu olarak ayarlandı.', 'success');
    
    setTimeout(() => {
      if (jsonTemplate) {
        simulateOMRProcessingReader();
      }
    }, 500);
  };

  const startScanning = () => {
    if (!videoRef.current || !cameraCanvasRef.current) return;
    
    setIsScanning(true);
    setAlignmentStatus('scanning');
    setCameraFrameColor('border-yellow-500');
    
    scanIntervalRef.current = setInterval(() => {
      detectAlignmentCircles();
    }, 500);
  };

  const detectAlignmentCircles = () => {
    if (!videoRef.current || !cameraCanvasRef.current) return;
    
    try {
      const video = videoRef.current;
      const canvas = cameraCanvasRef.current;
      const ctx = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      
      const detected = detectCircles(pixels, canvas.width, canvas.height);
      setDetectedCorners(detected);
      
      if (detected.length >= 4) {
        setAlignmentStatus('aligned');
        setCameraFrameColor('border-green-500');
        
        setTimeout(() => {
          captureAndProcess();
        }, 1000);
      } else if (detected.length >= 2) {
        setAlignmentStatus('partial');
        setCameraFrameColor('border-blue-500');
      } else {
        setAlignmentStatus('scanning');
        setCameraFrameColor('border-yellow-500');
      }
    } catch (error) {
      console.error('Hizalama tespit hatası:', error);
    }
  };

  const detectCircles = (pixels, width, height) => {
    const circles = [];
    const threshold = 100;
    const minDistance = 50;
    
    for (let y = 0; y < height; y += 10) {
      for (let x = 0; x < width; x += 10) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        
        if (r < 50 && g < 100 && b > 150) {
          let tooClose = false;
          for (const circle of circles) {
            const distance = Math.sqrt(Math.pow(x - circle.x, 2) + Math.pow(y - circle.y, 2));
            if (distance < minDistance) {
              tooClose = true;
              break;
            }
          }
          
          if (!tooClose) {
            circles.push({ x, y });
            
            if (circles.length >= 4) {
              return circles;
            }
          }
        }
      }
    }
    
    return circles;
  };

  const captureAndProcess = () => {
    if (!isScanning) return;
    
    captureImage();
    
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    stopCamera();
  };

  // ============ GERÇEK OCR FONKSİYONLARI ============
  const performOCR = async (imageData, area) => {
    const { x, y, w, h, label } = area;
    
    try {
      setIsOcrProcessing(true);
      setOcrProgress(10);
      
      addResult(`  🔍 <b>${label}</b> alanı OCR ile okunuyor...`, 'info');
      
      const img = new Image();
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = imageData;
      });
      
      setOcrProgress(30);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = w;
      canvas.height = h;
      
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      
      setOcrProgress(60);
      
      const imageDataForOCR = preprocessImageForOCR(ctx, canvas);
      
      setOcrProgress(80);
      
      const result = await Tesseract.recognize(
        imageDataForOCR,
        'tur+eng',
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setOcrProgress(80 + Math.floor(m.progress * 20));
            }
          }
        }
      );
      
      setOcrProgress(100);
      
      const text = result.data.text.trim();
      addResult(`  ✓ <b>${label}:</b> "${text}"`, 'success');
      
      setIsOcrProcessing(false);
      return text;
      
    } catch (error) {
      console.error('OCR hatası:', error);
      addResult(`  ❌ <b>${label}:</b> OCR hatası: ${error.message}`, 'error');
      setIsOcrProcessing(false);
      return "(OCR ile okunamadı)";
    }
  };

  const preprocessImageForOCR = (ctx, canvas) => {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    }
    
    const contrast = 1.5;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = contrast * (data[i] - 128) + 128;
      data[i + 1] = contrast * (data[i + 1] - 128) + 128;
      data[i + 2] = contrast * (data[i + 2] - 128) + 128;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    return canvas.toDataURL('image/png');
  };

  const extractNameAndSurname = (fullName) => {
    if (!fullName || fullName === "(OCR ile okunamadı)") {
      return { name: "", surname: "" };
    }
    
    let cleaned = fullName
      .replace(/[^\w\sĞÜŞİÖÇğüşıöç]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const parts = cleaned.split(' ');
    if (parts.length === 1) {
      return { name: parts[0], surname: "" };
    } else if (parts.length === 2) {
      return { name: parts[0], surname: parts[1] };
    } else {
      return { 
        name: parts[0], 
        surname: parts.slice(1).join(' ') 
      };
    }
  };

  // ============ DÜZENLEME FONKSİYONLARI ============
  const openEditMode = () => {
    if (!processedData) return;
    
    setEditedData({
      studentId: processedData.studentId || "",
      name: processedData.ocr?.name || "",
      surname: processedData.ocr?.surname || "",
      className: processedData.ocr?.className || 
                 processedData.ocr?.["Sınıf"] || 
                 processedData.ocr?.["Class"] || 
                 processedData.className || 
                 "",
      answers: processedData.studentAnswers || {}
    });
    
    setEditMode(true);
  };

  const saveEditedData = () => {
    const updatedProcessedData = {
      ...processedData,
      studentId: editedData.studentId,
      ocr: {
        ...processedData.ocr,
        name: editedData.name,
        surname: editedData.surname,
        className: editedData.className,
        "Sınıf": editedData.className,
        "Class": editedData.className
      },
      studentAnswers: editedData.answers
    };
    
    setProcessedData(updatedProcessedData);
    setEditMode(false);
    
    addResult(`✓ Veriler başarıyla düzenlendi ve kaydedildi. Sınıf: ${editedData.className || '(boş)'}`, 'success');
  };

  const updateAnswerInEditMode = (questionNum, answer) => {
    setEditedData(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionNum]: answer
      }
    }));
  };

  // ============ FORM ÜRETİCİ FONKSİYONLARI ============
  const handleSettingChange = (key, value) => {
    const numericKeys = [
      'questionCount', 'optionCount', 'studentDigits', 'columnCount', 'columnGap',
      'radius', 'lineWidth', 'rowGap', 'studentHGap', 'studentVGap', 'optionHGap',
      'startX', 'startY', 'studentX', 'studentY', 'scorePerCorrect',
      'questionColumns', 'questionColumnGap', 'bubbleRowGap', 'bubbleColumnGap',
      'studentBubbleRowGap', 'studentBubbleColumnGap', 'questionNumberGap',
      'bubbleSize', 'studentNameGap'
    ];
    
    if (key === 'studentNumberSettings') {
      setFormSettings(prev => ({ 
        ...prev, 
        studentNumberSettings: {
          ...prev.studentNumberSettings,
          ...value
        }
      }));
    } else {
      setFormSettings(prev => ({ 
        ...prev, 
        [key]: numericKeys.includes(key) 
          ? parseInt(value) || 0 
          : value 
      }));
    }
  };

  const handleStudentInfoChange = (key, value) => {
    setStudentInfo(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const updateAnswerKey = (questionNum, answer) => {
    const newAnswerKey = {
      ...answerKey,
      [questionNum]: answer
    };

    const newSelectedBubbles = { ...selectedBubbles };
    
    for (let i = 0; i < formSettings.optionCount; i++) {
      const opt = String.fromCharCode(65 + i);
      const k = `${questionNum}_${opt}`;
      delete newSelectedBubbles[k];
    }

    if (answer && answer !== '') {
        const newKey = `${questionNum}_${answer}`;
        newSelectedBubbles[newKey] = true;
    }
    
    setAnswerKey(newAnswerKey);
    setAnswerKeyInputs(newAnswerKey);
    setSelectedBubbles(newSelectedBubbles);
    
    generatePreview(newAnswerKey, newSelectedBubbles);
  };

  const generatePreview = (customAnswerKey = null, customSelectedBubbles = null) => {
    const currentAnswerKey = customAnswerKey || answerKey;
    const currentSelectedBubbles = customSelectedBubbles || selectedBubbles;

    const canvas = document.createElement('canvas');
    canvas.width = A4_WIDTH_PX;
    canvas.height = A4_HEIGHT_PX;
    const ctx = canvas.getContext('2d');

    previewCanvasRef.current = canvas;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, A4_WIDTH_PX, A4_HEIGHT_PX);

    let startX = formSettings.startX;
    let startY = formSettings.startY;
    
    let adjustedStudentY = formSettings.studentY;
    
    if (formSettings.collisionPrevention) {
      const studentNameBottom = 180;
      const minimumStudentY = studentNameBottom + formSettings.studentNameGap;
      if (adjustedStudentY < minimumStudentY) {
        adjustedStudentY = minimumStudentY;
      }
      
      const studentNumberHeight = 10 * formSettings.studentBubbleRowGap;
      const studentAreaBottom = adjustedStudentY + studentNumberHeight;
      
      if (startY < studentAreaBottom + 50) {
        startY = studentAreaBottom + 50;
      }
    }

    // Başlık
    ctx.fillStyle = formSettings.color;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(formSettings.title, A4_WIDTH_PX / 2, 80);

    // Öğrenci bilgileri alanı
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText("AD SOYAD:", 150, 120);
    ctx.fillText("SINIF:", 650, 120);
    
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(150, 130, 300, 30);
    ctx.fillRect(650, 130, 150, 30);
    
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    ctx.strokeRect(150, 130, 300, 30);
    ctx.strokeRect(650, 130, 150, 30);
    
    ctx.fillStyle = formSettings.color;
    ctx.font = '16px Arial';
    ctx.fillText(`${studentInfo.name || ''} ${studentInfo.surname || ''}`, 155, 152);
    ctx.fillText(studentInfo.className || '', 655, 152);

    // Öğrenci numarası alanı - YENİ VERSİYON
    const studentSettings = formSettings.studentNumberSettings || {};
    const labelX = studentSettings.labelX || formSettings.studentX - 80;
    const labelY = studentSettings.labelY || adjustedStudentY - 10;
    const bubblesX = studentSettings.bubblesX || formSettings.studentX;
    const bubblesY = studentSettings.bubblesY || adjustedStudentY;
    
    ctx.font = '14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(studentSettings.labelText || "ÖĞRENCİ NO:", labelX, labelY);

    // Öğrenci bubble'ları
    const studentBubbleRadius = studentSettings.bubbleRadius || (formSettings.bubbleSize / 2);
    for (let digitPos = 0; digitPos < formSettings.studentDigits; digitPos++) {
      for (let digitValue = 0; digitValue < 10; digitValue++) {
        const x = bubblesX + digitPos * formSettings.studentBubbleColumnGap;
        const y = bubblesY + digitValue * formSettings.studentBubbleRowGap;
        
        ctx.beginPath();
        ctx.arc(x, y, studentBubbleRadius, 0, Math.PI * 2);
        ctx.strokeStyle = formSettings.color;
        ctx.lineWidth = formSettings.lineWidth;
        ctx.stroke();
        
        ctx.fillStyle = formSettings.color;
        ctx.font = `${Math.max(8, studentBubbleRadius * 1.2)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(digitValue.toString(), x, y);
      }
    }

    // Sorular
    const questionsPerColumn = Math.ceil(formSettings.questionCount / formSettings.questionColumns);
    
    for (let col = 0; col < formSettings.questionColumns; col++) {
      for (let row = 0; row < Math.min(questionsPerColumn, formSettings.questionCount - col * questionsPerColumn); row++) {
        const questionNum = col * questionsPerColumn + row + 1;
        const xBase = startX + col * formSettings.questionColumnGap;
        const yBase = startY + row * formSettings.bubbleRowGap;
        
        ctx.fillStyle = formSettings.color;
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(`${questionNum}.`, xBase, yBase + 5);
        
        const correctAnswer = currentAnswerKey[questionNum];
        
        for (let opt = 0; opt < formSettings.optionCount; opt++) {
          const x = xBase + formSettings.questionNumberGap + opt * formSettings.bubbleColumnGap;
          const y = yBase;
          const optChar = String.fromCharCode(65 + opt);
          
          const isCorrect = correctAnswer === optChar;
          const bubbleRadius = formSettings.bubbleSize / 2;
          
          const isSelected = currentSelectedBubbles[`${questionNum}_${optChar}`];
          
          ctx.beginPath();
          ctx.arc(x, y, bubbleRadius, 0, Math.PI * 2);
          
          if (isSelected) {
            ctx.fillStyle = '#000000';
            ctx.fill();
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = formSettings.lineWidth;
            ctx.stroke();
            
            ctx.fillStyle = '#FFFFFF';
            ctx.font = `${Math.max(8, bubbleRadius * 1.2)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(optChar, x, y);
          } else if (isCorrect) {
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = formSettings.lineWidth + 2;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(x, y, bubbleRadius - 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
            ctx.fill();
            
            ctx.fillStyle = '#10B981';
            ctx.font = `${Math.max(8, bubbleRadius * 1.2)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(optChar, x, y);
          } else {
            ctx.strokeStyle = formSettings.color;
            ctx.lineWidth = formSettings.lineWidth;
            ctx.stroke();
            
            ctx.fillStyle = formSettings.color;
            ctx.font = `${Math.max(8, bubbleRadius * 1.2)}px Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(optChar, x, y);
          }
        }
      }
    }

    // Hizalama çemberleri
    const margin = 100;
    const alignmentPositions = [
      [margin, margin],
      [A4_WIDTH_PX - margin, margin],
      [margin, A4_HEIGHT_PX - margin],
      [A4_WIDTH_PX - margin, A4_HEIGHT_PX - margin]
    ];

    alignmentPositions.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.strokeStyle = '#0000FF';
      ctx.lineWidth = 3;
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(x - 7.5, y);
      ctx.lineTo(x + 7.5, y);
      ctx.moveTo(x, y - 7.5);
      ctx.lineTo(x, y + 7.5);
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    const previewDataUrl = canvas.toDataURL('image/png');
    setPreviewImage(previewDataUrl);

    const formData = {
      ...formSettings,
      preview: previewDataUrl,
      timestamp: new Date().toISOString(),
      answerKey: currentAnswerKey,
      studentInfo: studentInfo,
      adjustedStudentY: adjustedStudentY,
      studentBubblesY: bubblesY
    };
    setGeneratedForm(formData);

    generateJsonTemplate(formData, adjustedStudentY);
  };

  const handleBubbleClick = (questionNum, option) => {
    if (!clickableMode) return;
    
    const bubbleKey = `${questionNum}_${option}`;
    const currentlySelected = selectedBubbles[bubbleKey];
    
    let newSelectedBubbles = { ...selectedBubbles };
    let newAnswerKey = { ...answerKey };
    
    if (currentlySelected) {
      delete newSelectedBubbles[bubbleKey];
      delete newAnswerKey[questionNum];
    } else {
      for (let i = 0; i < formSettings.optionCount; i++) {
        const otherOption = String.fromCharCode(65 + i);
        const otherKey = `${questionNum}_${otherOption}`;
        delete newSelectedBubbles[otherKey];
      }
      
      newSelectedBubbles[bubbleKey] = true;
      newAnswerKey[questionNum] = option;
    }
    
    setSelectedBubbles(newSelectedBubbles);
    setAnswerKey(newAnswerKey);
    setAnswerKeyInputs(newAnswerKey);
    
    generatePreview(newAnswerKey, newSelectedBubbles);
  };

  const autoFillAnswerKey = () => {
    const newAnswerKey = {};
    const newSelectedBubbles = {};
    
    for (let i = 1; i <= formSettings.questionCount; i++) {
      const randomAnswer = String.fromCharCode(65 + Math.floor(Math.random() * formSettings.optionCount));
      newAnswerKey[i] = randomAnswer;
      newSelectedBubbles[`${i}_${randomAnswer}`] = true;
    }
    
    setAnswerKey(newAnswerKey);
    setAnswerKeyInputs(newAnswerKey);
    setSelectedBubbles(newSelectedBubbles);
    
    setTimeout(() => generatePreview(), 10);
  };

  const clearAnswerKey = () => {
    setAnswerKey({});
    setAnswerKeyInputs({});
    setSelectedBubbles({});
    
    setTimeout(() => generatePreview(), 10);
  };

  const generateJsonTemplate = (formData, adjustedStudentY) => {
    const studentSettings = formData.studentNumberSettings || {};
    const bubblesX = studentSettings.bubblesX || formData.studentX;
    const bubblesY = studentSettings.bubblesY || adjustedStudentY;
    const studentBubbleRadius = studentSettings.bubbleRadius || (formData.bubbleSize / 2);
    
    const studentIdBubbles = [];
    for (let digitPos = 0; digitPos < formData.studentDigits; digitPos++) {
      for (let digitValue = 0; digitValue < 10; digitValue++) {
        const x = bubblesX + digitPos * formData.studentBubbleColumnGap;
        const y = bubblesY + digitValue * formData.studentBubbleRowGap;
        
        studentIdBubbles.push({
          x: Math.round(x),
          y: Math.round(y),
          radius: studentBubbleRadius,
          label: digitValue.toString(),
          digit: digitPos
        });
      }
    }

    const answerBubbles = [];
    const questionsPerColumn = Math.ceil(formData.questionCount / formData.questionColumns);
    let startX = formData.startX;
    let startY = formData.startY;
    
    if (formData.collisionPrevention) {
      const studentNumberHeight = 10 * formData.studentBubbleRowGap;
      const studentAreaBottom = bubblesY + studentNumberHeight;
      
      if (startY < studentAreaBottom + 50) {
        startY = studentAreaBottom + 50;
      }
    }
    
    for (let col = 0; col < formData.questionColumns; col++) {
      for (let row = 0; row < Math.min(questionsPerColumn, formData.questionCount - col * questionsPerColumn); row++) {
        const questionNum = col * questionsPerColumn + row + 1;
        const xBase = startX + col * formData.questionColumnGap;
        const yBase = startY + row * formData.bubbleRowGap;
        
        for (let opt = 0; opt < formData.optionCount; opt++) {
          const x = xBase + formData.questionNumberGap + opt * formData.bubbleColumnGap;
          const y = yBase;
          const optChar = String.fromCharCode(65 + opt);
          
          answerBubbles.push({
            x: Math.round(x),
            y: Math.round(y),
            radius: formData.bubbleSize / 2,
            label: `${questionNum}_${optChar}`,
            question: questionNum,
            option: optChar
          });
        }
      }
    }

    const ocrAreas = [
      {
        x: 150,
        y: 130,
        w: 300,
        h: 30,
        label: "Ad Soyad",
        type: "text"
      },
      {
        x: 650,
        y: 130,
        w: 150,
        h: 30,
        label: "Sınıf",
        type: "text"
      }
    ];

    const jsonTemplate = {
      template_info: {
        title: formData.title,
        created_at: new Date().toISOString(),
        question_count: formData.questionCount,
        option_count: formData.optionCount,
        student_id_digits: formData.studentDigits,
        score_per_correct_answer: formData.scorePerCorrect,
        question_columns: formData.questionColumns,
        question_column_gap: formData.questionColumnGap,
        bubble_row_gap: formData.bubbleRowGap,
        bubble_column_gap: formData.bubbleColumnGap,
        bubble_size: formData.bubbleSize,
        student_bubble_row_gap: formData.studentBubbleRowGap,
        student_bubble_column_gap: formData.studentBubbleColumnGap,
        student_name_gap: formData.studentNameGap,
        student_info: studentInfo,
        adjusted_student_y: adjustedStudentY,
        student_settings: studentSettings
      },
      student_id_bubbles: studentIdBubbles,
      student_id_digits: formData.studentDigits,
      answer_bubbles: answerBubbles,
      ocr_areas: ocrAreas,
      alignment_circles: [
        { x: 100, y: 100, radius: 15 },
        { x: A4_WIDTH_PX - 100, y: 100, radius: 15 },
        { x: 100, y: A4_HEIGHT_PX - 100, radius: 15 },
        { x: A4_WIDTH_PX - 100, y: A4_HEIGHT_PX - 100, radius: 15 }
      ],
      answer_key: answerKey,
      qrcode_areas: [
        { x: A4_WIDTH_PX - 200, y: 50, width: 150, height: 150 }
      ],
      ocr_overrides: {
        form_type: "Sınav Formu",
        version: "1.0"
      }
    };

    setGeneratedJson(jsonTemplate);
  };

  const simulateOMRProcessingGenerator = () => {
    if (!generatedJson || Object.keys(answerKey).length === 0) {
      alert('Lütfen önce form oluşturun ve cevap anahtarını girin!');
      return;
    }

    const studentAnswers = {};
    let correct = 0, incorrect = 0, blank = 0, invalid = 0;
    
    for (let i = 1; i <= formSettings.questionCount; i++) {
      const random = Math.random();
      
      if (random < 0.3) {
        studentAnswers[i] = '-';
        blank++;
      } else if (random < 0.35) {
        studentAnswers[i] = 'X';
        invalid++;
      } else {
        const randomAnswer = String.fromCharCode(65 + Math.floor(Math.random() * formSettings.optionCount));
        studentAnswers[i] = randomAnswer;
        
        if (answerKey[i] === randomAnswer) {
          correct++;
        } else {
          incorrect++;
        }
      }
    }

    const score = correct * formSettings.scorePerCorrect;

    const results = {
      studentAnswers,
      answerKey,
      stats: {
        correct,
        incorrect,
        blank,
        invalid,
        score,
        totalQuestions: formSettings.questionCount,
        percentage: (correct / formSettings.questionCount * 100).toFixed(1)
      },
      details: []
    };

    for (let i = 1; i <= formSettings.questionCount; i++) {
      const studentAns = studentAnswers[i];
      const correctAns = answerKey[i];
      
      let status = '';
      let color = '';
      
      if (studentAns === '-') {
        status = 'Boş';
        color = 'text-orange-500';
      } else if (studentAns === 'X') {
        status = 'Geçersiz';
        color = 'text-red-600';
      } else if (studentAns === correctAns) {
        status = 'Doğru';
        color = 'text-green-600';
      } else {
        status = 'Yanlış';
        color = 'text-red-500';
      }
      
      results.details.push({
        question: i,
        studentAnswer: studentAns,
        correctAnswer: correctAns,
        status,
        color
      });
    }

    setProcessingResults(results);
  };

  const downloadForm = () => {
    if (!generatedForm || !previewImage) return;

    const link = document.createElement('a');
    link.href = previewImage;
    link.download = `omr-form-${formSettings.title.replace(/\s+/g, '-').toLowerCase()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadJson = () => {
    if (!generatedJson) return;

    const jsonStr = JSON.stringify(generatedJson, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `omr-template-${formSettings.title.replace(/\s+/g, '-').toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    downloadForm();
    setTimeout(downloadJson, 500);
  };

  // ============ FORM OKUYUCU FONKSİYONLARI ============
  const handleFileSelect = (file, type) => {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = {
        name: file.name,
        data: e.target.result,
        type: file.type
      };

      switch (type) {
        case 'student':
          setStudentForm(data);
          setActiveTab('student');
          break;
        case 'json':
          setJsonTemplate(data);
          setActiveTab('json');
          try {
            const jsonData = JSON.parse(e.target.result);
            data.parsed = jsonData;
            
            if (jsonData.answer_key) {
              const questionCount = jsonData.template_info?.question_count || Object.keys(jsonData.answer_key).length;
              const hasAllAnswers = Object.keys(jsonData.answer_key).length >= questionCount;
              
              if (!hasAllAnswers) {
                addResult(`⚠️ JSON'da ${questionCount} soru var ama sadece ${Object.keys(jsonData.answer_key).length} soru için cevap anahtarı tanımlı!`, 'warning');
              }
            }
          } catch (err) {
            addResult(`JSON formatı hatalı: ${err.message}`, 'error');
          }
          break;
        case 'answerKey':
          setAnswerKeyForm(data);
          setActiveTab('answerKey');
          break;
        default:
          break;
      }
    };

    if (type === 'json') {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  const addResult = (message, type = 'info') => {
    setResults(prev => [...prev, { message, type, timestamp: Date.now() }]);
  };

  const processImageWithCanvas = (imageData, callback) => {
    const imgElement = new window.Image();
    imgElement.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = imgElement.width;
      canvas.height = imgElement.height;
      ctx.drawImage(imgElement, 0, 0);
      callback(canvas, ctx, imgElement.width, imgElement.height);
    };
    imgElement.src = imageData;
  };

  const checkBubbleFilled = (ctx, x, y, radius) => {
    const imageData = ctx.getImageData(x - radius, y - radius, radius * 2, radius * 2);
    const pixels = imageData.data;
    let darkPixels = 0;
    let totalPixels = 0;

    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      const brightness = (r + g + b) / 3;
      
      if (brightness < 128) darkPixels++;
      totalPixels++;
    }

    return (darkPixels / totalPixels) > 0.35;
  };

  const readStudentId = (ctx, bubbles, digits) => {
    const studentDigits = [];
    
    for (let col = 0; col < digits; col++) {
      let selectedDigit = '-';
      const startIdx = col * 10;
      
      for (let digit = 0; digit < 10; digit++) {
        const bubble = bubbles[startIdx + digit];
        if (bubble && checkBubbleFilled(ctx, bubble.x, bubble.y, bubble.radius)) {
          if (selectedDigit !== '-') {
            selectedDigit = 'X';
            break;
          }
          selectedDigit = digit.toString();
        }
      }
      studentDigits.push(selectedDigit);
    }
    
    return studentDigits.join('');
  };

  const readAnswers = (ctx, answerBubbles) => {
    const answers = {};
    const questionMap = {};

    answerBubbles.forEach(bubble => {
      const [qNum, option] = bubble.label.split('_');
      if (!questionMap[qNum]) {
        questionMap[qNum] = [];
      }
      questionMap[qNum].push({ option, ...bubble });
    });

    Object.keys(questionMap).forEach(qNum => {
      let selected = '-';
      questionMap[qNum].forEach(bubble => {
        if (checkBubbleFilled(ctx, bubble.x, bubble.y, bubble.radius)) {
          if (selected !== '-') {
            selected = 'X';
          } else {
            selected = bubble.option;
          }
        }
      });
      answers[qNum] = selected;
    });

    return answers;
  };

  const compareAnswers = (studentAnswers, answerKey, template) => {
    addResult('\n📊 KARŞILAŞTIRMA SONUÇLARI:', 'subheader');
    
    let correct = 0, incorrect = 0, blank = 0, invalid = 0;
    const questionCount = template.template_info?.question_count || Object.keys(studentAnswers).length;
    
    for (let i = 1; i <= questionCount; i++) {
      const studentAns = studentAnswers[i] || '-';
      const correctAns = answerKey[i];
      
      if (studentAns === '-') {
        blank++;
        addResult(`  <b>Soru ${i}:</b> Boş`, 'warning');
      } else if (studentAns === 'X') {
        invalid++;
        addResult(`  <b>Soru ${i}:</b> Geçersiz (Birden fazla işaretli)`, 'error');
      } else if (!correctAns || correctAns === '-') {
        addResult(`  <b>Soru ${i}:</b> Öğrenci: ${studentAns}, Cevap Anahtarı: Tanımlı Değil`, 'warning');
      } else if (studentAns === correctAns) {
        correct++;
        addResult(`  <b>Soru ${i}:</b> Doğru (Öğrenci:${studentAns}, Doğru:${correctAns})`, 'success');
      } else {
        incorrect++;
        addResult(`  <b>Soru ${i}:</b> Yanlış (Öğrenci:${studentAns}, Doğru:${correctAns})`, 'error');
      }
    }

    const scorePerCorrect = template.template_info?.score_per_correct_answer || 5;
    const score = correct * scorePerCorrect;

    addResult('\n---------- ÖZET ----------', 'subheader');
    addResult(`  ✅ <b>Doğru:</b> ${correct}`, 'success');
    addResult(`  ❌ <b>Yanlış:</b> ${incorrect}`, 'error');
    addResult(`  ⬜ <b>Boş:</b> ${blank}`, 'info');
    addResult(`  ❗ <b>Geçersiz:</b> ${invalid}`, 'warning');
    addResult(`  🎯 <b>Puan: ${score}</b> (Doğru başına ${scorePerCorrect} puan)`, 'header');

    return { correct, incorrect, blank, invalid, score };
  };

  const simulateOMRProcessingReader = async () => {
    if (!studentForm || !jsonTemplate) {
      addResult('Lütfen Öğrenci Formu ve JSON Şablonu seçin', 'error');
      return;
    }

    if (!jsonTemplate.parsed) {
      addResult('JSON şablonu geçersiz veya okunamadı', 'error');
      return;
    }

    setIsProcessing(true);
    setResults([]);
    addResult('📄 OMR İşlemi Başlatılıyor...', 'header');
    addResult(`📄 Öğrenci Formu: ${studentForm.name}`, 'info');
    addResult(`📄 Şablon: ${jsonTemplate.name}`, 'info');
    
    if (answerKeyForm && !useSameFormForAnswerKey) {
      addResult(`🔑 Cevap Anahtarı Formu: ${answerKeyForm.name}`, 'info');
    }

    processImageWithCanvas(studentForm.data, async (canvas, ctx, width, height) => {
      const template = jsonTemplate.parsed;

      addResult('\n📝 OCR ALANLARI OKUNUYOR:', 'subheader');
      const ocrResults = {};
      
      if (template.ocr_areas && template.ocr_areas.length > 0) {
        for (const area of template.ocr_areas) {
          const ocrText = await performOCR(studentForm.data, area);
          ocrResults[area.label] = ocrText;
          
          if (area.label.toLowerCase().includes('sınıf') || area.label.toLowerCase().includes('class')) {
            addResult(`  <b>Sınıf Alanı Tespit Edildi:</b> ${area.label}`, 'info');
          }
        }
      }

      if (template.ocr_overrides) {
        Object.entries(template.ocr_overrides).forEach(([key, value]) => {
          ocrResults[key] = value;
          addResult(`  <b>${key}:</b> ${value} (JSON Override)`, 'info');
        });
      }

      const processedOCR = { ...ocrResults };
      if (ocrResults["Ad Soyad"]) {
        const nameParts = extractNameAndSurname(ocrResults["Ad Soyad"]);
        processedOCR.name = nameParts.name;
        processedOCR.surname = nameParts.surname;
      }
      
      if (ocrResults["Sınıf"] || ocrResults["sınıf"] || ocrResults["Class"]) {
        processedOCR.className = ocrResults["Sınıf"] || ocrResults["sınıf"] || ocrResults["Class"];
        addResult(`  <b>Sınıf OCR Sonucu:</b> ${processedOCR.className}`, 'success');
      }
      
      for (const [key, value] of Object.entries(ocrResults)) {
        if (key.toLowerCase().includes('sınıf') || key.toLowerCase().includes('class')) {
          processedOCR.className = value;
          addResult(`  <b>Sınıf (${key}):</b> ${value}`, 'info');
          break;
        }
      }

      addResult('\n🔢 ÖĞRENCİ NUMARASI OKUNUYOR:', 'subheader');
      let studentId = '-';
      
      if (template.student_id_bubbles && template.student_id_digits) {
        studentId = readStudentId(ctx, template.student_id_bubbles, template.student_id_digits);
        addResult(`  <b>Öğrenci No:</b> ${studentId} (Baloncuklardan Okunan)`, 'info');
      } else {
        addResult(`  <b>Öğrenci No:</b> Tanımlı değil`, 'warning');
      }

      addResult('\n📝 ÖĞRENCİ CEVAPLARI OKUNUYOR:', 'subheader');
      let studentAnswers = {};
      
      if (template.answer_bubbles) {
        studentAnswers = readAnswers(ctx, template.answer_bubbles);
        addResult('  Öğrenci cevapları formdaki baloncuklardan okundu:', 'info');
        Object.entries(studentAnswers).forEach(([q, a]) => {
          addResult(`    <b>Soru ${q}:</b> ${a}`, 'info');
        });
      } else {
        addResult('  Cevap baloncukları tanımlı değil', 'warning');
      }

      let finalAnswerKey = template.answer_key || {};
      
      if (answerKeyForm && !useSameFormForAnswerKey) {
        addResult('\n🔑 CEVAP ANAHTARI FORMU OKUNUYOR:', 'subheader');
        processImageWithCanvas(answerKeyForm.data, (keyCanvas, keyCtx, keyWidth, keyHeight) => {
          const keyAnswers = readAnswers(keyCtx, template.answer_bubbles);
          finalAnswerKey = keyAnswers;
          addResult('  Cevap anahtarı formdaki baloncuklardan okundu:', 'info');
          Object.entries(keyAnswers).forEach(([q, a]) => {
            addResult(`    <b>Soru ${q}:</b> ${a}`, 'info');
          });
          
          const stats = compareAnswers(studentAnswers, finalAnswerKey, template);
          
          setProcessedData({
            ocr: processedOCR,
            studentId,
            studentAnswers,
            correctAnswers: finalAnswerKey,
            stats
          });
          
          setOcrData(processedOCR);
          
          addResult('\n🎉 İŞLEM TAMAMLANDI.', 'header');
          setIsProcessing(false);
        });
      } else if (useSameFormForAnswerKey && studentForm) {
        addResult('\n⚠️ AYNI FORMDAN CEVAP ANAHTARI OKUNUYOR:', 'warning');
        addResult('  Öğrenci formu cevap anahtarı olarak kullanılıyor', 'info');
        
        finalAnswerKey = studentAnswers;
        
        const stats = compareAnswers(studentAnswers, finalAnswerKey, template);
        
        setProcessedData({
          ocr: processedOCR,
          studentId,
          studentAnswers,
          correctAnswers: finalAnswerKey,
          stats
        });
        
        setOcrData(processedOCR);
        
        addResult('\n🎉 İŞLEM TAMAMLANDI.', 'header');
        setIsProcessing(false);
      } else {
        addResult('\n📄 JSON CEVAP ANAHTARI KULLANILIYOR:', 'subheader');
        
        if (Object.keys(finalAnswerKey).length === 0) {
          addResult('  ⚠️ JSON\'da cevap anahtarı tanımlı değil!', 'warning');
        } else {
          addResult('  JSON\'daki cevap anahtarı kullanılıyor:', 'info');
          Object.entries(finalAnswerKey).forEach(([q, a]) => {
            addResult(`    <b>Soru ${q}:</b> ${a}`, 'info');
          });
        }
        
        const stats = compareAnswers(studentAnswers, finalAnswerKey, template);
        
        setProcessedData({
          ocr: processedOCR,
          studentId,
          studentAnswers,
          correctAnswers: finalAnswerKey,
          stats
        });
        
        setOcrData(processedOCR);
        
        addResult('\n🎉 İŞLEM TAMAMLANDI.', 'header');
        setIsProcessing(false);
      }
    });
  };

  const ResultMessage = ({ message, type }) => {
    const styles = {
      header: 'text-xl font-bold text-blue-700 my-2',
      subheader: 'text-lg font-semibold text-cyan-600 my-1',
      error: 'text-red-600 font-medium',
      success: 'text-green-600',
      warning: 'text-orange-500',
      info: 'text-gray-800'
    };

    return (
      <div 
        className={`${styles[type] || styles.info} py-1`}
        dangerouslySetInnerHTML={{ __html: message }}
      />
    );
  };

  const FileUploadButton = ({ label, file, onFileSelect, inputRef, icon, color }) => {
    const colorClasses = {
      green: 'bg-green-500 hover:bg-green-600',
      blue: 'bg-blue-500 hover:bg-blue-600',
      yellow: 'bg-yellow-500 hover:bg-yellow-600'
    };

    return (
      <div className="flex items-center gap-4">
        <input
          type="file"
          ref={inputRef}
          onChange={(e) => onFileSelect(e.target.files[0])}
          accept={label.includes('JSON') ? '.json' : 'image/*'}
          className="hidden"
        />
        <button
          onClick={() => inputRef.current?.click()}
          className={`${colorClasses[color]} text-white px-6 py-2 rounded-lg font-medium transition-all hover:shadow-lg flex items-center gap-2`}
        >
          {icon}
          {label}
        </button>
        <span className="text-gray-600 italic flex-1">
          {file ? file.name : 'Dosya seçilmedi'}
        </span>
      </div>
    );
  };

  const TabButton = ({ active, onClick, label }) => (
    <button
      onClick={onClick}
      className={`px-6 py-3 font-medium transition-all ${
        active
          ? 'bg-white text-blue-600 border-b-2 border-blue-600'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  );

  const InteractivePreview = ({ previewImage }) => {
    if (!previewImage) return null;

    const calculateBubblePositions = () => {
      const positions = [];
      const studentSettings = formSettings.studentNumberSettings || {};
      const bubblesX = studentSettings.bubblesX || formSettings.studentX;
      const bubblesY = studentSettings.bubblesY || formSettings.studentY;
      
      let startX = formSettings.startX;
      let startY = formSettings.startY;
      let adjustedStudentY = formSettings.studentY;
      
      if (formSettings.collisionPrevention) {
        const studentNameBottom = 180;
        const minimumStudentY = studentNameBottom + formSettings.studentNameGap;
        if (adjustedStudentY < minimumStudentY) {
          adjustedStudentY = minimumStudentY;
        }
        
        const studentNumberHeight = 10 * formSettings.studentBubbleRowGap;
        const studentAreaBottom = adjustedStudentY + studentNumberHeight;
        
        if (startY < studentAreaBottom + 50) {
          startY = studentAreaBottom + 50;
        }
      }
      
      const questionsPerColumn = Math.ceil(formSettings.questionCount / formSettings.questionColumns);
      
      for (let col = 0; col < formSettings.questionColumns; col++) {
        for (let row = 0; row < Math.min(questionsPerColumn, formSettings.questionCount - col * questionsPerColumn); row++) {
          const questionNum = col * questionsPerColumn + row + 1;
          const xBase = startX + col * formSettings.questionColumnGap;
          const yBase = startY + row * formSettings.bubbleRowGap;
          
          for (let opt = 0; opt < formSettings.optionCount; opt++) {
            const x = xBase + formSettings.questionNumberGap + opt * formSettings.bubbleColumnGap;
            const y = yBase;
            const optChar = String.fromCharCode(65 + opt);
            const radius = formSettings.bubbleSize / 2;
            
            positions.push({
              type: 'answer',
              questionNum,
              option: optChar,
              x: x - radius,
              y: y - radius,
              width: radius * 2,
              height: radius * 2,
              centerX: x,
              centerY: y,
              radius
            });
          }
        }
      }
      
      const studentBubbleRadius = studentSettings.bubbleRadius || (formSettings.bubbleSize / 2);
      for (let digitPos = 0; digitPos < formSettings.studentDigits; digitPos++) {
        for (let digitValue = 0; digitValue < 10; digitValue++) {
          const x = bubblesX + digitPos * formSettings.studentBubbleColumnGap;
          const y = bubblesY + digitValue * formSettings.studentBubbleRowGap;
          
          positions.push({
            type: 'student',
            digitPos,
            digitValue,
            x: x - studentBubbleRadius,
            y: y - studentBubbleRadius,
            width: studentBubbleRadius * 2,
            height: studentBubbleRadius * 2,
            centerX: x,
            centerY: y,
            radius: studentBubbleRadius
          });
        }
      }
      
      return positions;
    };

    const bubblePositions = calculateBubblePositions();

    const handleImageClick = (e) => {
      if (!clickableMode) return;
      
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      const scaleX = rect.width / A4_WIDTH_PX;
      const scaleY = rect.height / A4_HEIGHT_PX;
      
      for (const bubble of bubblePositions) {
        if (bubble.type !== 'answer') continue;
        
        const tolerance = bubble.radius * scaleX * 1.5;
        const bubbleCenterX = bubble.centerX * scaleX;
        const bubbleCenterY = bubble.centerY * scaleY;
        
        const distance = Math.sqrt(
          Math.pow(clickX - bubbleCenterX, 2) + 
          Math.pow(clickY - bubbleCenterY, 2)
        );
        
        if (distance <= tolerance) {
          handleBubbleClick(bubble.questionNum, bubble.option);
          break;
        }
      }
    };

    return (
      <div className="relative">
        <img 
          src={previewImage} 
          alt="Form Önizlemesi" 
          className="max-w-full h-auto border border-gray-200 rounded-lg shadow-sm cursor-pointer"
          onClick={handleImageClick}
          style={{ cursor: clickableMode ? 'pointer' : 'default' }}
        />
        
        {clickableMode && (
          <div className="absolute top-2 right-2 bg-red-500 text-white px-3 py-1 rounded-lg font-medium animate-pulse">
            <MousePointer className="inline mr-2" size={16} />
            Tıklanabilir Mod Aktif
          </div>
        )}
      </div>
    );
  };

  // Kamera kontrolleri için yeni butonlar
  const CameraControls = () => (
    <div className="flex gap-2 mt-4">
      <button
        onClick={() => {
          const newValue = !showAlignmentGrid;
          setShowAlignmentGrid(newValue);
          addResult(newValue ? '✓ Hizalama kılavuzu açıldı' : '✓ Hizalama kılavuzu kapatıldı', 'success');
        }}
        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg flex items-center gap-2"
      >
        <Grid3x3 size={16} />
        {showAlignmentGrid ? 'Kılavuz Kapat' : 'Kılavuz Aç'}
      </button>
      
      <button
        onClick={() => {
          if (cameraStream) {
            const track = cameraStream.getVideoTracks()[0];
            const constraints = track.getConstraints();
            
            if (constraints.facingMode === 'environment') {
              track.applyConstraints({ facingMode: 'user' });
              addResult('📷 Ön kamera kullanılıyor', 'info');
            } else {
              track.applyConstraints({ facingMode: 'environment' });
              addResult('📷 Arka kamera kullanılıyor', 'info');
            }
          }
        }}
        className="px-3 py-2 bg-blue-200 hover:bg-blue-300 text-blue-700 rounded-lg flex items-center gap-2"
      >
        <RotateCw size={16} />
        Kamera Değiştir
      </button>
      
      <button
        onClick={() => {
          if (videoRef.current) {
            const video = videoRef.current;
            const currentScale = video.style.transform.includes('scaleX(-1)') ? '' : 'scaleX(-1)';
            video.style.transform = currentScale;
            addResult(currentScale ? '✓ Ayna görünümü açıldı' : '✓ Ayna görünümü kapatıldı', 'success');
          }
        }}
        className="px-3 py-2 bg-purple-200 hover:bg-purple-300 text-purple-700 rounded-lg flex items-center gap-2"
      >
        <Upload size={16} style={{ transform: 'rotate(90deg)' }} />
        Ayna Görünümü
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <FileText size={36} />
              OMR Sistemi - Form Üretici & Okuyucu
            </h1>
            <p className="text-purple-100 mt-2 flex items-center gap-2">
              <Edit size={16} />
              Kapsamlı OMR Form Oluşturma ve Okuma Sistemi
            </p>
          </div>

          <div className="flex border-b">
            <button
              onClick={() => setAppMode('generator')}
              className={`flex-1 px-6 py-4 font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                appMode === 'generator'
                  ? 'bg-white text-purple-600 border-b-2 border-purple-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Settings size={20} />
              Form Üretici
            </button>
            <button
              onClick={() => setAppMode('reader')}
              className={`flex-1 px-6 py-4 font-bold text-lg transition-all flex items-center justify-center gap-2 ${
                appMode === 'reader'
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <FileText size={20} />
              Form Okuyucu
            </button>
          </div>

          {appMode === 'generator' ? (
            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-6">
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Settings size={20} />
                    Form Ayarları
                    <span className="ml-auto text-xs text-green-600 font-normal">
                      ✓ Otomatik kaydedildi
                    </span>
                  </h2>
                  
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <h3 className="font-bold text-blue-800 mb-3 flex items-center gap-2">
                        <User size={16} />
                        Öğrenci Bilgileri
                      </h3>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Ad
                          </label>
                          <input
                            type="text"
                            value={studentInfo.name}
                            onChange={(e) => handleStudentInfoChange('name', e.target.value)}
                            placeholder="Öğrenci adı"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Soyad
                          </label>
                          <input
                            type="text"
                            value={studentInfo.surname}
                            onChange={(e) => handleStudentInfoChange('surname', e.target.value)}
                            placeholder="Öğrenci soyadı"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Sınıf
                          </label>
                          <input
                            type="text"
                            value={studentInfo.className}
                            onChange={(e) => handleStudentInfoChange('className', e.target.value)}
                            placeholder="Örn: 9-A"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                      <h3 className="font-bold text-indigo-800 mb-3 flex items-center gap-2">
                        <Users size={16} />
                        Öğrenci Numarası Pozisyon Ayarları
                      </h3>
                      
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Label X (px)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              value={formSettings.studentNumberSettings?.labelX || 100}
                              onChange={(e) => handleSettingChange('studentNumberSettings', {
                                ...formSettings.studentNumberSettings,
                                labelX: parseInt(e.target.value) || 100
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Label Y (px)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              value={formSettings.studentNumberSettings?.labelY || 200}
                              onChange={(e) => handleSettingChange('studentNumberSettings', {
                                ...formSettings.studentNumberSettings,
                                labelY: parseInt(e.target.value) || 200
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Baloncuk X (px)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              value={formSettings.studentNumberSettings?.bubblesX || 100}
                              onChange={(e) => handleSettingChange('studentNumberSettings', {
                                ...formSettings.studentNumberSettings,
                                bubblesX: parseInt(e.target.value) || 100
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Baloncuk Y (px)
                            </label>
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              value={formSettings.studentNumberSettings?.bubblesY || 220}
                              onChange={(e) => handleSettingChange('studentNumberSettings', {
                                ...formSettings.studentNumberSettings,
                                bubblesY: parseInt(e.target.value) || 220
                              })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Label - Baloncuk Mesafesi (px)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={formSettings.studentNumberSettings?.labelGap || 20}
                            onChange={(e) => handleSettingChange('studentNumberSettings', {
                              ...formSettings.studentNumberSettings,
                              labelGap: parseInt(e.target.value) || 20
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Öğrenci Numarası Baloncuk Yarıçapı (px)
                          </label>
                          <input
                            type="number"
                            min="4"
                            max="20"
                            value={formSettings.studentNumberSettings?.bubbleRadius || 8}
                            onChange={(e) => handleSettingChange('studentNumberSettings', {
                              ...formSettings.studentNumberSettings,
                              bubbleRadius: parseInt(e.target.value) || 8
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Label Metni
                          </label>
                          <input
                            type="text"
                            value={formSettings.studentNumberSettings?.labelText || "ÖĞRENCİ NO:"}
                            onChange={(e) => handleSettingChange('studentNumberSettings', {
                              ...formSettings.studentNumberSettings,
                              labelText: e.target.value
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        
                        <button
                          onClick={() => handleSettingChange('studentNumberSettings', {
                            labelX: 100,
                            labelY: 200,
                            bubblesX: 100,
                            bubblesY: 220,
                            labelGap: 20,
                            bubbleRadius: 8,
                            labelText: "ÖĞRENCİ NO:"
                          })}
                          className="w-full bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium py-2 px-4 rounded-lg transition-all"
                        >
                          <RotateCw className="inline mr-2" size={16} />
                          Varsayılana Sıfırla
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Form Başlığı
                      </label>
                      <input
                        type="text"
                        value={formSettings.title}
                        onChange={(e) => handleSettingChange('title', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Soru Sayısı
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="200"
                          value={formSettings.questionCount}
                          onChange={(e) => handleSettingChange('questionCount', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Şık Sayısı
                        </label>
                        <input
                          type="number"
                          min="2"
                          max="10"
                          value={formSettings.optionCount}
                          onChange={(e) => handleSettingChange('optionCount', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Öğrenci Basamak Sayısı
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="10"
                          value={formSettings.studentDigits}
                          onChange={(e) => handleSettingChange('studentDigits', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Soru Sütun Sayısı
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="5"
                          value={formSettings.questionColumns}
                          onChange={(e) => handleSettingChange('questionColumns', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sütunlar Arası Mesafe (px)
                        </label>
                        <input
                          type="number"
                          min="50"
                          max="500"
                          value={formSettings.questionColumnGap}
                          onChange={(e) => handleSettingChange('questionColumnGap', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Soru Satır Aralığı (px)
                        </label>
                        <input
                          type="number"
                          min="15"
                          max="100"
                          value={formSettings.bubbleRowGap}
                          onChange={(e) => handleSettingChange('bubbleRowGap', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Şık Sütun Aralığı (px)
                        </label>
                        <input
                          type="number"
                          min="20"
                          max="100"
                          value={formSettings.bubbleColumnGap}
                          onChange={(e) => handleSettingChange('bubbleColumnGap', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Soru No - Şık Mesafe (px)
                        </label>
                        <input
                          type="number"
                          min="20"
                          max="100"
                          value={formSettings.questionNumberGap}
                          onChange={(e) => handleSettingChange('questionNumberGap', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Öğrenci No Satır Aralığı (px)
                          </label>
                          <input
                            type="number"
                            min="15"
                            max="100"
                            value={formSettings.studentBubbleRowGap}
                            onChange={(e) => handleSettingChange('studentBubbleRowGap', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Öğrenci No Sütun Aralığı (px)
                          </label>
                          <input
                            type="number"
                            min="20"
                            max="100"
                            value={formSettings.studentBubbleColumnGap}
                            onChange={(e) => handleSettingChange('studentBubbleColumnGap', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <h3 className="font-bold text-yellow-800 mb-3 flex items-center gap-2">
                          <AlertCircle size={16} />
                          Ad Soyad - Öğrenci Numarası Ayarları
                        </h3>
                        
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Ad Soyad - Öğrenci Numarası Aralığı (px)
                            </label>
                            <input
                              type="number"
                              min="20"
                              max="200"
                              value={formSettings.studentNameGap}
                              onChange={(e) => handleSettingChange('studentNameGap', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              Ad soyad alanı ile öğrenci numarası baloncukları arasındaki dikey boşluk
                            </p>
                          </div>
                          
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="collisionPrevention"
                              checked={formSettings.collisionPrevention}
                              onChange={(e) => handleSettingChange('collisionPrevention', e.target.checked)}
                              className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="collisionPrevention" className="ml-2 text-sm text-gray-700">
                              Çakışma Önleme Aktif
                            </label>
                          </div>
                          <p className="text-xs text-gray-500">
                            {formSettings.collisionPrevention 
                              ? "✓ Ad soyad ve öğrenci numarası çakışması otomatik önleniyor"
                              : "⚠ Çakışma önleme kapalı, manuel ayar yapılmalı"}
                          </p>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Soru Baloncuk Büyüklüğü (px)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="8"
                            max="40"
                            step="1"
                            value={formSettings.bubbleSize}
                            onChange={(e) => handleSettingChange('bubbleSize', e.target.value)}
                            className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-center"
                          />
                          <div className="flex flex-col">
                            <button 
                              onClick={() => handleSettingChange('bubbleSize', Math.min(40, formSettings.bubbleSize + 1))}
                              disabled={formSettings.bubbleSize >= 40}
                              className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded-t text-sm disabled:opacity-50"
                            >
                              <Plus size={12} />
                            </button>
                            <button 
                              onClick={() => handleSettingChange('bubbleSize', Math.max(8, formSettings.bubbleSize - 1))}
                              disabled={formSettings.bubbleSize <= 8}
                              className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded-b text-sm disabled:opacity-50"
                            >
                              <Minus size={12} />
                            </button>
                          </div>
                          <span className="ml-2 text-sm text-gray-500">
                            Çap: {formSettings.bubbleSize}px
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          Sadece soru baloncuklarında geçerli
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Doğru Başına Puan
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={formSettings.scorePerCorrect}
                          onChange={(e) => handleSettingChange('scorePerCorrect', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>

                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
                        <h3 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                          <MousePointer size={16} />
                          Baloncuk Tıklama Modu
                        </h3>
                        
                        <div className="space-y-3">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="clickableMode"
                              checked={clickableMode}
                              onChange={() => {
                                setClickableMode(!clickableMode);
                                if (!clickableMode) {
                                  addResult('🔘 Baloncuk tıklama modu açıldı. Form üzerindeki baloncuklara tıklayarak cevap anahtarı oluşturun. Tıklanan baloncuklar SİYAH dolacaktır. Aynı baloncuğa tekrar tıklayarak işareti kaldırabilirsiniz.', 'info');
                                } else {
                                  addResult('✅ Baloncuk tıklama modu kapandı.', 'success');
                                }
                              }}
                              className="h-4 w-4 text-purple-600 rounded focus:ring-purple-500"
                            />
                            <label htmlFor="clickableMode" className="ml-2 text-sm text-gray-700">
                              Form üzerindeki baloncuklara tıklayarak cevap anahtarı oluştur
                            </label>
                          </div>
                          <p className="text-xs text-gray-500">
                            {clickableMode 
                              ? "✅ Tıklama modu açık. Form üzerindeki baloncuklara tıklayarak cevap anahtarını belirleyin. Tıklanan baloncuklar SİYAH dolacaktır. Aynı baloncuğa tekrar tıklayarak işareti kaldırabilirsiniz."
                              : "🔘 Tıklama modu kapalı. Cevap anahtarını manuel olarak girin veya formu kullanın."}
                          </p>
                          
                          {clickableMode && (
                            <div className="mt-2 text-sm text-purple-700 bg-purple-100 p-2 rounded">
                              <p><strong>Kullanım Talimatları:</strong></p>
                              <ul className="list-disc pl-5 mt-1 space-y-1">
                                <li>Form üzerindeki baloncuklara tıklayarak cevap anahtarını belirleyin</li>
                                <li>Her soru için sadece bir şık seçilebilir</li>
                                <li>Tıklanan baloncuklar SİYAH dolacaktır</li>
                                <li>Aynı baloncuğa tekrar tıklayarak işareti kaldırabilirsiniz</li>
                                <li>İşiniz bitince tıklama modunu kapatın</li>
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={generatePreview}
                          className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
                        >
                          <Eye size={20} />
                          Form Önizlemesi
                        </button>
                        
                        <button
                          onClick={() => setShowAnswerKeyDialog(true)}
                          className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          <Key size={20} />
                          Cevap Anahtarı
                        </button>
                      </div>

                      {generatedJson && Object.keys(answerKey).length > 0 && (
                        <button
                          onClick={simulateOMRProcessingGenerator}
                          className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          <CheckCircle size={20} />
                          Test İşlemini Simüle Et
                        </button>
                      )}
                    </div>
                  </div>

                  {Object.keys(answerKey).length > 0 && (
                    <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                      <h3 className="font-bold text-green-800 mb-2 flex items-center gap-2">
                        <Key size={16} />
                        Cevap Anahtarı
                      </h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-green-700">
                          <span className="font-medium">Toplam Soru:</span> {formSettings.questionCount}
                        </div>
                        <div className="text-green-700">
                          <span className="font-medium">Girilen:</span> {Object.keys(answerKey).length}
                        </div>
                        <div className="text-green-700">
                          <span className="font-medium">Boş:</span> {formSettings.questionCount - Object.keys(answerKey).length}
                        </div>
                        <div className="text-green-700">
                          <span className="font-medium">Doğru Puanı:</span> {formSettings.scorePerCorrect}
                        </div>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={autoFillAnswerKey}
                          className="flex-1 bg-blue-100 hover:bg-blue-200 text-blue-700 text-sm font-medium py-1 px-3 rounded-lg transition-all flex items-center justify-center gap-1"
                        >
                          <Copy size={14} />
                          Otomatik Doldur
                        </button>
                        <button
                          onClick={clearAnswerKey}
                          className="flex-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium py-1 px-3 rounded-lg transition-all flex items-center justify-center gap-1"
                        >
                          <Trash2 size={14} />
                          Temizle
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                    <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                      <ImageIcon size={20} />
                      Form Önizlemesi
                      {previewImage && (
                        <span className="ml-auto text-sm font-normal text-gray-500">
                          {studentInfo.name || studentInfo.surname || studentInfo.className 
                            ? `📝 Öğrenci: ${studentInfo.name} ${studentInfo.surname} | Sınıf: ${studentInfo.className || "-"}`
                            : "Otomatik güncelleniyor..."}
                        </span>
                      )}
                    </h2>
                    
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 bg-white min-h-[400px] flex items-center justify-center relative">
                      {previewImage ? (
                        <div className="text-center relative" ref={previewContainerRef}>
                          <InteractivePreview previewImage={previewImage} />
                          <div className="mt-2 text-sm text-gray-500 grid grid-cols-2 gap-2">
                            <div>Boyut: {A4_WIDTH_PX} × {A4_HEIGHT_PX} px</div>
                            <div>Sütunlar: {formSettings.questionColumns}</div>
                            <div>Sorular: {formSettings.questionCount}</div>
                            <div>Soru Baloncuk: {formSettings.bubbleSize}px</div>
                            <div>Öğrenci Baloncuk: {formSettings.studentNumberSettings?.bubbleRadius || (formSettings.bubbleSize/2)}px</div>
                            <div>Ad Soyad Boşluğu: {formSettings.studentNameGap}px</div>
                            <div>Çakışma Önleme: {formSettings.collisionPrevention ? 'Aktif' : 'Pasif'}</div>
                            <div>Label Pozisyon: X:{formSettings.studentNumberSettings?.labelX || 100} Y:{formSettings.studentNumberSettings?.labelY || 200}</div>
                            <div>Baloncuk Pozisyon: X:{formSettings.studentNumberSettings?.bubblesX || 100} Y:{formSettings.studentNumberSettings?.bubblesY || 220}</div>
                            {studentInfo.name && <div>Ad: {studentInfo.name}</div>}
                            {studentInfo.surname && <div>Soyad: {studentInfo.surname}</div>}
                            {studentInfo.className && <div>Sınıf: {studentInfo.className}</div>}
                            {Object.keys(answerKey).length > 0 && (
                              <div className="col-span-2 text-green-600 font-medium">
                                ✓ {Object.keys(answerKey).length} soru için cevap anahtarı işaretli
                              </div>
                            )}
                            {formSettings.collisionPrevention && (
                              <div className="col-span-2 text-blue-600 text-xs">
                                ⓘ Ad soyad ile öğrenci numarası çakışması otomatik önleniyor
                              </div>
                            )}
                            {clickableMode && (
                              <div className="col-span-2 text-purple-600 font-medium">
                                🖱️ Tıklama Modu Aktif - Baloncuklara tıklayın! Tıklanan baloncuklar SİYAH dolacaktır. Aynı baloncuğa tekrar tıklayarak işareti kaldırabilirsiniz.
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-gray-400">
                          <ImageIcon size={48} className="mx-auto mb-3 opacity-50" />
                          <p className="text-lg">Ayarları düzenleyin, form otomatik olarak güncellenecektir.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {processingResults && (
                    <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-200">
                      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <CheckCircle size={20} className="text-blue-600" />
                        Test İşleme Sonuçları
                      </h2>
                      
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <div className="bg-green-100 p-4 rounded-lg text-center">
                          <div className="text-3xl font-bold text-green-700">{processingResults.stats.correct}</div>
                          <div className="text-sm text-green-600">Doğru</div>
                        </div>
                        <div className="bg-red-100 p-4 rounded-lg text-center">
                          <div className="text-3xl font-bold text-red-700">{processingResults.stats.incorrect}</div>
                          <div className="text-sm text-red-600">Yanlış</div>
                        </div>
                        <div className="bg-orange-100 p-4 rounded-lg text-center">
                          <div className="text-3xl font-bold text-orange-700">{processingResults.stats.blank}</div>
                          <div className="text-sm text-orange-600">Boş</div>
                        </div>
                        <div className="bg-pink-100 p-4 rounded-lg text-center">
                          <div className="text-3xl font-bold text-pink-700">{processingResults.stats.invalid}</div>
                          <div className="text-sm text-pink-600">Geçersiz</div>
                        </div>
                        <div className="bg-blue-100 p-4 rounded-lg text-center">
                          <div className="text-3xl font-bold text-blue-700">{processingResults.stats.score}</div>
                          <div className="text-sm text-blue-600">Puan</div>
                        </div>
                      </div>

                      <div className="max-h-60 overflow-y-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="p-2 text-left">Soru</th>
                              <th className="p-2 text-left">Öğrenci Cevabı</th>
                              <th className="p-2 text-left">Doğru Cevap</th>
                              <th className="p-2 text-left">Durum</th>
                            </tr>
                          </thead>
                          <tbody>
                            {processingResults.details.map((detail, index) => (
                              <tr key={index} className="border-b border-gray-200">
                                <td className="p-2">{detail.question}</td>
                                <td className="p-2">
                                  {detail.studentAnswer === '-' ? (
                                    <span className="text-orange-500">Boş</span>
                                  ) : detail.studentAnswer === 'X' ? (
                                    <span className="text-red-600">Geçersiz</span>
                                  ) : (
                                    detail.studentAnswer
                                  )}
                                </td>
                                <td className="p-2">{detail.correctAnswer || '-'}</td>
                                <td className={`p-2 font-medium ${detail.color}`}>
                                  {detail.status}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {generatedForm && generatedJson && (
                    <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <CheckCircle size={20} className="text-green-600" />
                        Form Hazır!
                      </h2>
                      
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <button
                          onClick={saveForms}
                          className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          <Save size={20} />
                          Formları Kaydet
                        </button>
                        
                        <button
                          onClick={downloadForm}
                          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          <Download size={20} />
                          PNG İndir
                        </button>
                        
                        <button
                          onClick={exportToPDF}
                          className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          <Printer size={20} />
                          PDF İndir
                        </button>
                        
                        <button
                          onClick={downloadAll}
                          className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
                        >
                          <Download size={20} />
                          Tümünü İndir
                        </button>
                      </div>
                      
                      <div className="mt-4 text-sm text-gray-600">
                        <p><strong>İşlem Seçenekleri:</strong></p>
                        <ul className="list-disc pl-5 mt-1 space-y-1">
                          <li><strong>Formları Kaydet:</strong> Form ayarlarını, cevap anahtarını ve öğrenci bilgilerini JSON olarak kaydeder</li>
                          <li><strong>PNG İndir:</strong> Formun görselini PNG formatında indirir</li>
                          <li><strong>PDF İndir:</strong> Formu yüksek kalitede PDF olarak indirir</li>
                          <li><strong>Tümünü İndir:</strong> PNG ve JSON dosyalarını birlikte indirir</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="p-6 space-y-4 bg-gray-50 border-b">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <FileUploadButton
                        label="Öğrenci Formu Seç..."
                        file={studentForm}
                        onFileSelect={(file) => handleFileSelect(file, 'student')}
                        inputRef={studentFormRef}
                        icon={<Upload size={20} />}
                        color="green"
                      />
                      
                      <FileUploadButton
                        label="JSON Şablonu Seç..."
                        file={jsonTemplate}
                        onFileSelect={(file) => handleFileSelect(file, 'json')}
                        inputRef={jsonTemplateRef}
                        icon={<BookOpen size={20} />}
                        color="blue"
                      />
                      
                      <FileUploadButton
                        label="Cevap Anahtarı Formu Seç... (opsiyonel)"
                        file={answerKeyForm}
                        onFileSelect={(file) => handleFileSelect(file, 'answerKey')}
                        inputRef={answerKeyRef}
                        icon={<CheckCircle size={20} />}
                        color="yellow"
                      />
                      
                      <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
                        <h3 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                          <Camera size={18} />
                          Kamera ile Form Okuma
                        </h3>
                        
                        <div className="space-y-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const confirmStart = window.confirm(
                                  '📷 Kamera ile Form Okuma\n\n' +
                                  'Kamera kullanarak formları hızlıca okuyabilirsiniz.\n\n' +
                                  'Devam etmek için:\n' +
                                  '1. "İzin ver" veya "Allow" butonuna tıklayın\n' +
                                  '2. Formu kameranın önüne yerleştirin\n' +
                                  '3. Form otomatik olarak tespit edilecek\n\n' +
                                  'Kamerayı açmak istiyor musunuz?'
                                );
                                
                                if (confirmStart) {
                                  startCamera();
                                }
                              }}
                              disabled={isCameraActive}
                              className="flex-1 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                              <Camera size={16} />
                              {isCameraActive ? 'Kamera Aktif' : 'Kamerayı Aç'}
                            </button>
                            
                            <button
                              onClick={stopCamera}
                              disabled={!isCameraActive}
                              className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                            >
                              <XCircle size={16} />
                              Kapat
                            </button>
                          </div>
                          
                          <button
                            onClick={captureImage}
                            disabled={!isCameraActive}
                            className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                          >
                            <Scan size={16} />
                            Görüntüyü Yakala
                          </button>
                          
                          <button
                            onClick={captureAndProcess}
                            disabled={!isCameraActive || !jsonTemplate}
                            className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                          >
                            <CheckCircle size={16} />
                            Otomatik Yakala ve İşle
                          </button>
                          
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="showGrid"
                              checked={showAlignmentGrid}
                              onChange={(e) => setShowAlignmentGrid(e.target.checked)}
                              className="h-4 w-4 text-purple-600 rounded focus:ring-purple-500"
                            />
                            <label htmlFor="showGrid" className="ml-2 text-sm text-gray-700">
                              Hizalama Kılavuzlarını Göster
                            </label>
                          </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-purple-100">
                          <div className="text-xs text-gray-600">
                            <details>
                              <summary className="cursor-pointer text-purple-600 hover:text-purple-800 font-medium">
                                🔧 Kamera izni vermede sorun yaşıyorsanız tıklayın
                              </summary>
                              <div className="mt-2 p-2 bg-white rounded border border-gray-200 text-left">
                                <p className="font-medium mb-1">Tarayıcınıza göre izin verme:</p>
                                <ul className="list-disc pl-5 space-y-1">
                                  <li><strong>Chrome/Edge:</strong> Adres çubuğundaki 🔒 simgesi → Site ayarları → Kamera → "İzin ver"</li>
                                  <li><strong>Firefox:</strong> Adres çubuğundaki 🔒 simgesi → Çark simgesi → Kamera iznini yönet → "İzin ver"</li>
                                  <li><strong>Safari:</strong> Safari → Tercihler → Web siteleri → Kamera → Bu site için "İzin ver"</li>
                                </ul>
                                <p className="mt-2 text-xs">İzin verdikten sonra sayfayı yenileyin ve tekrar deneyin.</p>
                              </div>
                            </details>
                          </div>
                          <div className="mt-2 text-xs text-gray-600 space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                              <span>Bekliyor</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                              <span>Form Aranıyor</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                              <span>Kısmen Tanındı</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-green-500"></div>
                              <span>Form Tanındı ✓</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                        <AlertCircle size={16} />
                        İşlem Seçenekleri
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="sameFormOption"
                            checked={useSameFormForAnswerKey}
                            onChange={(e) => setUseSameFormForAnswerKey(e.target.checked)}
                            className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                          />
                          <label htmlFor="sameFormOption" className="ml-2 text-sm text-gray-700">
                            Aynı formu cevap anahtarı olarak kullan
                          </label>
                        </div>
                        <p className="text-xs text-gray-500">
                          {useSameFormForAnswerKey 
                            ? "Öğrenci formundaki işaretlemeler cevap anahtarı olarak kullanılacak. Tüm cevaplar doğru kabul edilecek."
                            : "Cevap anahtarı için ayrı form kullanılacak."}
                        </p>
                      </div>
                      
                      <div className="mt-4 pt-3 border-t border-blue-100">
                        <div className="text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <User size={12} className="text-green-600" />
                            <span className="font-medium">Öğrenci Formu:</span>
                            <span className="text-gray-600">{studentForm ? studentForm.name : 'Seçilmedi'}</span>
                          </div>
                          <div className="flex items-center gap-2 mb-1">
                            <BookOpen size={12} className="text-blue-600" />
                            <span className="font-medium">JSON Şablon:</span>
                            <span className="text-gray-600">{jsonTemplate ? jsonTemplate.name : 'Seçilmedi'}</span>
                          </div>
                          {answerKeyForm && !useSameFormForAnswerKey && (
                            <div className="flex items-center gap-2">
                              <CheckCircle size={12} className="text-yellow-600" />
                              <span className="font-medium">Cevap Anahtarı:</span>
                              <span className="text-gray-600">{answerKeyForm.name}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {isCameraActive && (
                        <div className="mt-4 pt-3 border-t border-blue-100">
                          <div className="text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              <div className={`w-3 h-3 rounded-full ${
                                alignmentStatus === 'waiting' ? 'bg-gray-400' :
                                alignmentStatus === 'scanning' ? 'bg-yellow-500' :
                                alignmentStatus === 'partial' ? 'bg-blue-500' :
                                'bg-green-500'
                              }`}></div>
                              <span className="font-medium">Form Durumu:</span>
                              <span className={`font-medium ${
                                alignmentStatus === 'waiting' ? 'text-gray-600' :
                                alignmentStatus === 'scanning' ? 'text-yellow-600' :
                                alignmentStatus === 'partial' ? 'text-blue-600' :
                                'text-green-600'
                              }`}>
                                {alignmentStatus === 'waiting' ? 'Bekliyor' :
                                 alignmentStatus === 'scanning' ? 'Form Aranıyor' :
                                 alignmentStatus === 'partial' ? 'Kısmen Tanındı' :
                                 'Form Tanındı ✓'}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Scan size={12} className="text-purple-600" />
                              <span className="font-medium">Tespit Edilen Köşe:</span>
                              <span className="text-gray-600">{detectedCorners.length}/4</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-b">
                  <div className="flex">
                    <TabButton
                      active={activeTab === 'student'}
                      onClick={() => setActiveTab('student')}
                      label="Öğrenci Formu"
                    />
                    <TabButton
                      active={activeTab === 'json'}
                      onClick={() => setActiveTab('json')}
                      label="JSON Şablonu"
                    />
                    <TabButton
                      active={activeTab === 'answerKey'}
                      onClick={() => setActiveTab('answerKey')}
                      label="C. Anahtarı Formu"
                    />
                    <TabButton
                      active={activeTab === 'camera'}
                      onClick={() => setActiveTab('camera')}
                      label={
                        <div className="flex items-center gap-1">
                          <Camera size={16} />
                          Kamera
                          {isCameraActive && (
                            <Circle className="text-red-500" size={8} fill="currentColor" />
                          )}
                        </div>
                      }
                    />
                  </div>
                </div>

                <div className="p-6 bg-white" style={{ minHeight: '400px', maxHeight: '500px', overflow: 'auto' }}>
                  {activeTab === 'student' && (
                    <div className="flex items-center justify-center h-64">
                      {studentForm ? (
                        <div className="text-center">
                          <img src={studentForm.data} alt="Öğrenci Formu" className="max-h-48 object-contain mx-auto" />
                          <p className="text-sm text-gray-500 mt-2">{studentForm.name}</p>
                        </div>
                      ) : (
                        <p className="text-gray-400 italic">Öğrenci formu önizlemesi</p>
                      )}
                    </div>
                  )}
                  
                  {activeTab === 'json' && (
                    <div className="h-64 overflow-auto">
                      {jsonTemplate ? (
                        <div>
                          <pre className="text-sm bg-gray-50 p-4 rounded font-mono">
                            {typeof jsonTemplate.data === 'string' 
                              ? jsonTemplate.data 
                              : JSON.stringify(jsonTemplate.parsed, null, 2)}
                          </pre>
                          {jsonTemplate.parsed?.answer_key && (
                            <div className="mt-2 text-sm">
                              <span className="font-medium text-green-700">Cevap Anahtarı:</span>
                              <span className="ml-2">
                                {Object.keys(jsonTemplate.parsed.answer_key).length} soru tanımlı
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-400 italic text-center pt-24">JSON şablonu önizlemesi</p>
                      )}
                    </div>
                  )}
                  
                  {activeTab === 'answerKey' && (
                    <div className="flex items-center justify-center h-64">
                      {answerKeyForm ? (
                        <div className="text-center">
                          <img src={answerKeyForm.data} alt="Cevap Anahtarı" className="max-h-48 object-contain mx-auto" />
                          <p className="text-sm text-gray-500 mt-2">{answerKeyForm.name}</p>
                        </div>
                      ) : useSameFormForAnswerKey && studentForm ? (
                        <div className="text-center">
                          <div className="bg-yellow-100 p-4 rounded-lg mb-4">
                            <AlertCircle className="inline mr-2 text-yellow-600" size={20} />
                            <span className="text-yellow-700 font-medium">Aynı Form Kullanılıyor</span>
                            <p className="text-sm text-yellow-600 mt-1">
                              Öğrenci formu cevap anahtarı olarak kullanılacak
                            </p>
                          </div>
                          <img src={studentForm.data} alt="Öğrenci Formu" className="max-h-32 object-contain mx-auto opacity-75" />
                        </div>
                      ) : (
                        <p className="text-gray-400 italic">C. Anahtarı formu önizlemesi</p>
                      )}
                    </div>
                  )}
                  
                  {activeTab === 'camera' && (
                    <div className="flex flex-col items-center justify-center h-96">
                      {isCameraActive ? (
                        <div className="relative w-full max-w-2xl">
                          <div className={`relative rounded-xl overflow-hidden border-4 ${cameraFrameColor} transition-all duration-300`}>
                            <video
                              ref={videoRef}
                              autoPlay
                              playsInline
                              className="w-full h-auto"
                              onLoadedMetadata={startScanning}
                            />
                            
                            {showAlignmentGrid && (
                              <div className="absolute inset-0 pointer-events-none">
                                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 opacity-50 transform -translate-y-1/2"></div>
                                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-red-500 opacity-50 transform -translate-x-1/2"></div>
                                
                                <div className="absolute top-1/4 left-1/4 w-1/2 h-1/2 border-2 border-dashed border-yellow-400 opacity-60"></div>
                                
                                <div className="absolute top-1/4 left-1/4 w-4 h-4 border-2 border-green-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                                <div className="absolute top-1/4 left-3/4 w-4 h-4 border-2 border-green-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                                <div className="absolute top-3/4 left-1/4 w-4 h-4 border-2 border-green-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                                <div className="absolute top-3/4 left-3/4 w-4 h-4 border-2 border-green-500 rounded-full transform -translate-x-1/2 -translate-y-1/2"></div>
                                
                                {detectedCorners.map((corner, index) => (
                                  <div 
                                    key={index}
                                    className="absolute w-6 h-6 border-2 border-white bg-blue-600 rounded-full transform -translate-x-1/2 -translate-y-1/2 animate-pulse"
                                    style={{ left: `${corner.x}px`, top: `${corner.y}px` }}
                                  >
                                    <div className="w-full h-full flex items-center justify-center text-white text-xs font-bold">
                                      {index + 1}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            
                            {isScanning && (
                              <div className="absolute top-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1 rounded-lg text-sm font-medium animate-pulse">
                                <Scan className="inline mr-2" size={14} />
                                Form Taranıyor...
                              </div>
                            )}
                            
                            <div className={`absolute top-4 right-4 px-3 py-1 rounded-lg text-sm font-medium ${
                              alignmentStatus === 'waiting' ? 'bg-gray-600 text-white' :
                              alignmentStatus === 'scanning' ? 'bg-yellow-500 text-white' :
                              alignmentStatus === 'partial' ? 'bg-blue-500 text-white' :
                              'bg-green-500 text-white'
                            }`}>
                              {alignmentStatus === 'waiting' ? '⏳ Bekliyor' :
                               alignmentStatus === 'scanning' ? '🔍 Form Aranıyor' :
                               alignmentStatus === 'partial' ? `📐 ${detectedCorners.length}/4 Köşe` :
                               '✅ Form Tanındı!'}
                            </div>
                          </div>
                          
                          <CameraControls />
                          
                          <div className="mt-4 text-center text-sm text-gray-600">
                            <p className="mb-2">
                              📱 <strong>Formu kameranın önüne yerleştirin</strong>
                            </p>
                            <p className="text-xs">
                              • Formun 4 köşesindeki mavi çemberlerin görünmesini sağlayın
                              <br />
                              • Form ekrana tam oturunca otomatik olarak yakalanacak
                              <br />
                              • Yeşil renk formun tanındığını gösterir
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-gray-400">
                          <Camera size={64} className="mx-auto mb-4 opacity-50" />
                          <p className="text-xl font-medium mb-2">Kamera Kapalı</p>
                          <p className="text-gray-500 max-w-md">
                            Formları hızlıca okumak için kamerayı açın. Formun 4 köşesindeki mavi çemberler otomatik olarak tespit edilecek ve form tanındığında otomatik olarak işlenecek.
                          </p>
                        </div>
                      )}
                      
                      <canvas ref={cameraCanvasRef} className="hidden" />
                    </div>
                  )}
                </div>

                <div className="p-6 bg-gray-50 border-t flex gap-4">
                  <button
                    onClick={simulateOMRProcessingReader}
                    disabled={!studentForm || !jsonTemplate || isProcessing}
                    className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        İşleniyor...
                      </>
                    ) : (
                      <>
                        <Scan size={20} />
                        OMR Formunu İşle
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={openEditMode}
                    disabled={!processedData}
                    className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Pencil size={20} />
                    Okunan Verileri Düzenle
                  </button>
                </div>

                {isOcrProcessing && (
                  <div className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-t">
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="animate-spin text-blue-600" size={24} />
                      <div className="flex-1">
                        <div className="text-blue-700 font-medium mb-1">OCR İşleniyor...</div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-green-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${ocrProgress}%` }}
                          ></div>
                        </div>
                        <div className="text-sm text-gray-600 mt-1 text-center">
                          %{ocrProgress} - Formdaki metinler okunuyor
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {results.length > 0 && (
                  <div className="p-6 bg-gradient-to-br from-gray-50 to-blue-50 border-t max-h-96 overflow-y-auto">
                    <div className="space-y-1 font-mono text-sm">
                      {results.map((result, index) => (
                        <ResultMessage key={index} message={result.message} type={result.type} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
        </div>

        <div className="mt-6 text-center text-gray-600 text-sm">
          <p>OMR Form Üretici ve Okuyucu Sistemi - Tek bir uygulamada iki güçlü araç</p>
          <p className="mt-1">
            <span className="font-medium">Güncellemeler:</span> 
            <span className="ml-2">• Tıklama modu düzeltildi: Aynı baloncuğa tekrar tıklayarak işareti kaldırabilirsiniz</span>
            <span className="ml-2">• <strong>Baloncuklar tıklandığında SİYAH doluyor</strong></span>
            <span className="ml-2">• Öğrenci numarası pozisyon ayarları eklendi: Label ve baloncuk pozisyonlarını bağımsız ayarlayın</span>
            <span className="ml-2">• Öğrenci numarası baloncuk boyutunu soru baloncuklarından farklı ayarlayabilirsiniz</span>
            <span className="ml-2">• Tüm ayarlar otomatik kaydedilir</span>
            <span className="ml-2">• OCR'dan gelen sınıf bilgisi düzenleme modunda otomatik yüklenir</span>
            <span className="ml-2">• <strong>Kamera izin mesajı eklendi: İzin reddedildiğinde kullanıcıyı bilgilendirir</strong></span>
            <span className="ml-2">• <strong>Kamera kontrolleri eklendi: Kamera değiştir, ayna görünümü, kılavuz aç/kapat</strong></span>
          </p>
        </div>
      </div>

      {showAnswerKeyDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-green-600 to-emerald-600 p-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Key size={28} />
                Cevap Anahtarını Girin
              </h2>
              <p className="text-green-100 mt-1">Toplam {formSettings.questionCount} soru için cevap anahtarını girin</p>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: formSettings.questionCount }, (_, i) => i + 1).map((questionNum) => (
                  <div key={questionNum} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="font-bold text-gray-800 mb-2 flex justify-between items-center">
                      <span>Soru {questionNum}</span>
                      <span className="text-sm font-normal text-gray-500">
                        {answerKey[questionNum] ? (
                          <span className="text-green-600">✓ {answerKey[questionNum]}</span>
                        ) : (
                          <span className="text-gray-400">Boş</span>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {Array.from({ length: formSettings.optionCount }, (_, i) => {
                        const letter = String.fromCharCode(65 + i);
                        return (
                          <button
                            key={letter}
                            onClick={() => updateAnswerKey(questionNum, letter)}
                            className={`flex-1 min-w-[40px] py-2 rounded-lg transition-all ${
                              answerKey[questionNum] === letter
                                ? 'bg-green-500 text-white font-bold'
                                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                            }`}
                          >
                            {letter}
                          </button>
                        );
                      })}
                      <button
                        onClick={() => updateAnswerKey(questionNum, '')}
                        className="flex-1 min-w-[60px] py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-all"
                      >
                        Temizle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 border-t flex justify-between">
              <div className="flex gap-3">
                <button
                  onClick={autoFillAnswerKey}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all flex items-center gap-2"
                >
                  <Copy size={16} />
                  Otomatik Doldur
                </button>
                <button
                  onClick={clearAnswerKey}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-all flex items-center gap-2"
                >
                  <Trash2 size={16} />
                  Temizle
                </button>
              </div>
              
              <div className="flex gap-3">
                <div className="bg-green-100 px-3 py-2 rounded-lg text-green-700 text-sm font-medium">
                  {Object.keys(answerKey).length}/{formSettings.questionCount} soru dolu
                </div>
                <button
                  onClick={() => setShowAnswerKeyDialog(false)}
                  className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all font-bold flex items-center gap-2"
                >
                  <CheckCircle size={16} />
                  Kaydet ve Kapat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editMode && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-6">
              <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                <Pencil size={28} />
                Okunan Verileri Düzenle
              </h2>
              <p className="text-blue-100 mt-1">OCR ve OMR ile okunan verileri manuel olarak düzenleyin</p>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-6">
                <div className="bg-blue-50 p-6 rounded-xl border border-blue-200">
                  <h3 className="text-lg font-bold text-blue-800 mb-4 flex items-center gap-2">
                    <User size={20} />
                    Öğrenci Bilgileri
                    {processedData?.ocr?.className && (
                      <span className="ml-auto text-sm bg-green-100 text-green-700 px-2 py-1 rounded">
                        OCR'dan Okundu: {processedData.ocr.className}
                      </span>
                    )}
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Öğrenci Numarası
                      </label>
                      <input
                        type="text"
                        value={editedData.studentId}
                        onChange={(e) => setEditedData(prev => ({...prev, studentId: e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Örn: 1234"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sınıf
                        {processedData?.ocr?.className && (
                          <span className="ml-2 text-xs text-green-600">
                            (OCR: {processedData.ocr.className})
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={editedData.className}
                        onChange={(e) => setEditedData(prev => ({...prev, className: e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder={processedData?.ocr?.className || "Örn: 9-A"}
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (processedData?.ocr?.className) {
                              setEditedData(prev => ({...prev, className: processedData.ocr.className}));
                              addResult(`✓ Sınıf bilgisi OCR değerine sıfırlandı: ${processedData.ocr.className}`, 'success');
                            }
                          }}
                          disabled={!processedData?.ocr?.className}
                          className="px-3 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          OCR Değerini Yükle
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => {
                            setEditedData(prev => ({...prev, className: ""}));
                          }}
                          className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                        >
                          Temizle
                        </button>
                      </div>
                      {processedData?.ocr?.className && editedData.className !== processedData.ocr.className && (
                        <div className="mt-1 text-xs text-yellow-600 flex items-center gap-1">
                          <AlertCircle size={12} />
                          <span>OCR'dan farklı bir değer girildi</span>
                        </div>
                      )}
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ad
                        {processedData?.ocr?.name && (
                          <span className="ml-2 text-xs text-green-600">
                            (OCR: {processedData.ocr.name})
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={editedData.name}
                        onChange={(e) => setEditedData(prev => ({...prev, name: e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder={processedData?.ocr?.name || "Öğrenci adı"}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Soyad
                        {processedData?.ocr?.surname && (
                          <span className="ml-2 text-xs text-green-600">
                            (OCR: {processedData.ocr.surname})
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={editedData.surname}
                        onChange={(e) => setEditedData(prev => ({...prev, surname: e.target.value}))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder={processedData?.ocr?.surname || "Öğrenci soyadı"}
                      />
                    </div>
                  </div>
                  
                  {processedData?.ocr && (
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <details className="text-sm">
                        <summary className="cursor-pointer text-blue-600 hover:text-blue-800 font-medium">
                          📄 OCR Ham Verileri (Tıklayarak Göster/Gizle)
                        </summary>
                        <div className="mt-2 bg-white p-3 rounded border border-gray-200">
                          <pre className="text-xs font-mono text-gray-700 overflow-auto">
                            {JSON.stringify(processedData.ocr, null, 2)}
                          </pre>
                        </div>
                      </details>
                    </div>
                  )}
                </div>

                <div className="bg-green-50 p-6 rounded-xl border border-green-200">
                  <h3 className="text-lg font-bold text-green-800 mb-4 flex items-center gap-2">
                    <CheckCircle size={20} />
                    Soru Cevapları
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {Object.keys(editedData.answers).sort((a,b) => parseInt(a) - parseInt(b)).map(questionNum => (
                      <div key={questionNum} className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="font-bold text-gray-800 mb-2">
                          Soru {questionNum}
                          {processedData?.correctAnswers?.[questionNum] && (
                            <span className="ml-2 text-xs text-green-600">
                              (Doğru: {processedData.correctAnswers[questionNum]})
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {['A', 'B', 'C', 'D', 'E'].slice(0, formSettings.optionCount || 5).map(option => (
                            <button
                              key={option}
                              onClick={() => updateAnswerInEditMode(questionNum, option)}
                              className={`flex-1 min-w-[30px] py-1 rounded text-sm transition-all ${
                                editedData.answers[questionNum] === option
                                  ? 'bg-green-500 text-white font-bold'
                                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                              }`}
                            >
                              {option}
                            </button>
                          ))}
                          <button
                            onClick={() => updateAnswerInEditMode(questionNum, '-')}
                            className={`flex-1 min-w-[40px] py-1 rounded text-sm transition-all ${
                              editedData.answers[questionNum] === '-'
                                ? 'bg-orange-500 text-white font-bold'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            Boş
                          </button>
                          <button
                            onClick={() => updateAnswerInEditMode(questionNum, 'X')}
                            className={`flex-1 min-w-[50px] py-1 rounded text-sm transition-all ${
                              editedData.answers[questionNum] === 'X'
                                ? 'bg-red-500 text-white font-bold'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                            }`}
                          >
                            Geçersiz
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-center text-gray-500">
                          {editedData.answers[questionNum] === '-' ? 'Boş' : 
                           editedData.answers[questionNum] === 'X' ? 'Geçersiz' : 
                           `Cevap: ${editedData.answers[questionNum]}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-yellow-50 p-6 rounded-xl border border-yellow-200">
                  <h3 className="text-lg font-bold text-yellow-800 mb-4 flex items-center gap-2">
                    <Eye size={20} />
                    Önizleme
                  </h3>
                  
                  <div className="bg-white p-4 rounded-lg border border-yellow-200">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-700">Öğrenci No:</span>
                        <span className="ml-2">{editedData.studentId || '(boş)'}</span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Sınıf:</span>
                        <span className="ml-2">{editedData.className || '(boş)'}</span>
                        {processedData?.ocr?.className && editedData.className !== processedData.ocr.className && (
                          <span className="ml-2 text-xs text-yellow-600">(OCR'dan farklı)</span>
                        )}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Ad:</span>
                        <span className="ml-2">{editedData.name || '(boş)'}</span>
                        {processedData?.ocr?.name && editedData.name !== processedData.ocr.name && (
                          <span className="ml-2 text-xs text-yellow-600">(OCR'dan farklı)</span>
                        )}
                      </div>
                      <div>
                        <span className="font-medium text-gray-700">Soyad:</span>
                        <span className="ml-2">{editedData.surname || '(boş)'}</span>
                        {processedData?.ocr?.surname && editedData.surname !== processedData.ocr.surname && (
                          <span className="ml-2 text-xs text-yellow-600">(OCR'dan farklı)</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium text-gray-700">Toplam Cevaplanan Soru:</span>
                        <span className="ml-2">
                          {Object.values(editedData.answers).filter(a => a !== '-' && a !== 'X').length} / {Object.keys(editedData.answers).length}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium text-gray-700">Boş Sorular:</span>
                        <span className="ml-2">
                          {Object.values(editedData.answers).filter(a => a === '-').length}
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="font-medium text-gray-700">Geçersiz Sorular:</span>
                        <span className="ml-2">
                          {Object.values(editedData.answers).filter(a => a === 'X').length}
                        </span>
                      </div>
                      {processedData?.stats && (
                        <>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700">Önceki Puan:</span>
                            <span className="ml-2">{processedData.stats.score || 0}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="font-medium text-gray-700">Önceki Doğru:</span>
                            <span className="ml-2">{processedData.stats.correct || 0}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 border-t flex justify-between">
              <button
                onClick={() => setEditMode(false)}
                className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-all font-medium flex items-center gap-2"
              >
                <XCircle size={16} />
                İptal
              </button>
              
              <button
                onClick={saveEditedData}
                className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all font-bold flex items-center gap-2"
              >
                <CheckCircle size={16} />
                Kaydet ve Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CombinedOMRApp;
