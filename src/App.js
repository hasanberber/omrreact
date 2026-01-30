// OMRFormReader.js
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import { 
  Upload, FileText, CheckCircle, XCircle, 
  AlertCircle, Eye, Camera, Scan, Grid, Pencil, Loader2,
  RotateCw, User, BookOpen, Circle, Target, Maximize2, Download,
  Save, Trash2, ZoomIn, ZoomOut, CheckSquare, Square
} from 'lucide-react';

const OMRFormReader = () => {
  // Form Okuyucu Bölümü
  const [studentForm, setStudentForm] = useState(null);
  const [jsonTemplate, setJsonTemplate] = useState(null);
  const [answerKeyForm, setAnswerKeyForm] = useState(null);
  const [activeTab, setActiveTab] = useState('camera'); // Kamerayı varsayılan yap
  const [results, setResults] = useState([]);
  const [processedData, setProcessedData] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useSameFormForAnswerKey, setUseSameFormForAnswerKey] = useState(false);

  // Kamera Özellikleri
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [alignmentStatus, setAlignmentStatus] = useState('waiting');
  const [cameraFrameColor, setCameraFrameColor] = useState('border-gray-400');
  const [showAlignmentGrid, setShowAlignmentGrid] = useState(true);
  const [detectedCorners, setDetectedCorners] = useState([]);
  const [isAutoCaptureMode, setIsAutoCaptureMode] = useState(true);
  const [showFormPlacementGuide, setShowFormPlacementGuide] = useState(true);
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [mirrorMode, setMirrorMode] = useState(false);

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

  // Refs
  const studentFormRef = useRef(null);
  const jsonTemplateRef = useRef(null);
  const answerKeyRef = useRef(null);
  const videoRef = useRef(null);
  const cameraCanvasRef = useRef(null);
  const scanIntervalRef = useRef(null);

  // Sayfa yüklendiğinde otomatik kamera aç
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
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
          addResult('📷 Kamera başarıyla açıldı! Formu kameranın önüne yerleştirin.', 'success');
        };
      }
      
    } catch (error) {
      console.error('Kamera açılamadı:', error);
      
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
      
      const userConfirmed = window.confirm(
        `${errorMessage}\n\n${errorDetails}\n\n` +
        'Kamera iznini vermek için:\n' +
        '1. Tarayıcınızın adres çubuğundaki 🔒 (kilit) simgesine tıklayın\n' +
        '2. "Site ayarları" veya "İzinler" bölümüne girin\n' +
        '3. Kamera iznini "İzin ver" olarak değiştirin\n' +
        '4. Sayfayı yenileyin\n\n' +
        'Kamerayı kullanmak istiyor musunuz?'
      );
      
      if (userConfirmed) {
        try {
          if (navigator.permissions) {
            const permissionStatus = await navigator.permissions.query({ name: 'camera' });
            permissionStatus.onchange = () => {
              if (permissionStatus.state === 'granted') {
                window.location.reload();
              }
            };
          }
          
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
      
      addResult(`❌ ${errorMessage} ${errorDetails ? `(${errorDetails})` : ''}`, 'error');
      throw error;
    }
  }, [addResult]);

  useEffect(() => {
    const initCamera = async () => {
      try {
        await startCamera();
      } catch (error) {
        console.log('Kamera otomatik açılamadı:', error.message);
        addResult('📷 Kamera otomatik açılamadı. Lütfen formları dosya olarak yükleyin.', 'warning');
      }
    };

    initCamera();

    // Cleanup
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [cameraStream, startCamera]);

  // KAMERA FONKSİYONLARI
  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
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
    setCapturedImage(imageData);
    
    const imageFile = {
      name: `form-${new Date().getTime()}.png`,
      data: imageData,
      type: 'image/png'
    };
    
    setStudentForm(imageFile);
    addResult('📸 Form görüntüsü yakalandı!', 'success');
    
    return imageFile;
  };

  const startScanning = () => {
    if (!videoRef.current || !cameraCanvasRef.current) return;
    
    setIsScanning(true);
    setAlignmentStatus('scanning');
    setCameraFrameColor('border-yellow-500');
    
    scanIntervalRef.current = setInterval(() => {
      detectAlignmentCircles();
    }, 300);
  };

  const detectAlignmentCircles = () => {
    if (!videoRef.current || !cameraCanvasRef.current || !isScanning) return;
    
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
        
        if (isAutoCaptureMode) {
          setTimeout(() => {
            captureAndProcess();
          }, 800);
        }
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
    const minDistance = 50;
    
    for (let y = 0; y < height; y += 8) {
      for (let x = 0; x < width; x += 8) {
        const idx = (y * width + x) * 4;
        const r = pixels[idx];
        const g = pixels[idx + 1];
        const b = pixels[idx + 2];
        
        // Mavi renk tespiti (OMR form köşe işaretleri)
        if (r < 100 && g < 150 && b > 150 && b > r * 1.5 && b > g * 1.2) {
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
    if (!isScanning || !jsonTemplate) return;
    
    const imageFile = captureImage();
    if (!imageFile) return;
    
    setIsScanning(false);
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    
    setTimeout(() => {
      simulateOMRProcessingReader();
    }, 1000);
  };

  const manualCaptureAndProcess = () => {
    if (!isCameraActive) {
      addResult('❌ Lütfen önce kamerayı açın!', 'error');
      return;
    }
    
    if (!jsonTemplate) {
      addResult('❌ Lütfen önce JSON şablonu yükleyin!', 'error');
      return;
    }
    
    const imageFile = captureImage();
    if (!imageFile) return;
    
    setTimeout(() => {
      simulateOMRProcessingReader();
    }, 500);
  };

  // GERÇEK OCR FONKSİYONLARI
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

  // DÜZENLEME FONKSİYONLARI
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

  // FORM OKUYUCU FONKSİYONLARI
  const addResult = useCallback((message, type = 'info') => {
    setResults(prev => [...prev, { message, type, timestamp: Date.now() }]);
  }, []);

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
          setActiveTab('camera');
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
            
            const questionCount = jsonData.template_info?.question_count || Object.keys(jsonData.answer_key || {}).length;
            addResult(`✓ JSON şablonu yüklendi: ${jsonData.template_info?.title || 'Bilinmeyen Form'}, ${questionCount || 'Bilinmeyen'} soru`, 'success');
            
            if (!isCameraActive) {
              startCamera();
            }
          } catch (err) {
            addResult(`❌ JSON formatı hatalı: ${err.message}`, 'error');
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
      addResult('❌ Lütfen Öğrenci Formu ve JSON Şablonu seçin', 'error');
      return;
    }

    if (!jsonTemplate.parsed) {
      addResult('❌ JSON şablonu geçersiz veya okunamadı', 'error');
      return;
    }

    setIsProcessing(true);
    setResults([]);
    addResult('📄 OMR İşlemi Başlatılıyor...', 'header');
    addResult(`📄 Öğrenci Formu: ${studentForm.name}`, 'info');
    addResult(`📄 Şablon: ${jsonTemplate.parsed.template_info?.title || 'Bilinmeyen Form'}`, 'info');
    
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

  const CameraControls = () => (
    <div className="flex flex-wrap gap-2 mt-4">
      <button
        onClick={() => {
          const newValue = !showAlignmentGrid;
          setShowAlignmentGrid(newValue);
          addResult(newValue ? '✓ Hizalama kılavuzu açıldı' : '✓ Hizalama kılavuzu kapatıldı', 'success');
        }}
        className="px-3 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg flex items-center gap-2"
      >
        <Grid size={16} />
        {showAlignmentGrid ? 'Kılavuz Kapat' : 'Kılavuz Aç'}
      </button>
      
      <button
        onClick={() => {
          const newValue = !showFormPlacementGuide;
          setShowFormPlacementGuide(newValue);
          addResult(newValue ? '✓ Form yerleştirme kılavuzu açıldı' : '✓ Form yerleştirme kılavuzu kapatıldı', 'success');
        }}
        className="px-3 py-2 bg-blue-200 hover:bg-blue-300 text-blue-700 rounded-lg flex items-center gap-2"
      >
        <Target size={16} />
        {showFormPlacementGuide ? 'Kılavuz Kapat' : 'Kılavuz Aç'}
      </button>
      
      <button
        onClick={() => {
          const newValue = !isAutoCaptureMode;
          setIsAutoCaptureMode(newValue);
          addResult(newValue ? '✓ Otomatik yakalama açıldı' : '✓ Otomatik yakalama kapatıldı', 'success');
        }}
        className={`px-3 py-2 ${isAutoCaptureMode ? 'bg-green-200 hover:bg-green-300' : 'bg-gray-200 hover:bg-gray-300'} ${isAutoCaptureMode ? 'text-green-700' : 'text-gray-700'} rounded-lg flex items-center gap-2`}
      >
        <Maximize2 size={16} />
        {isAutoCaptureMode ? 'Otomatik Açık' : 'Otomatik Kapalı'}
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
        className="px-3 py-2 bg-purple-200 hover:bg-purple-300 text-purple-700 rounded-lg flex items-center gap-2"
      >
        <RotateCw size={16} />
        Kamera Değiştir
      </button>
      
      <button
        onClick={() => {
          setMirrorMode(!mirrorMode);
          if (videoRef.current) {
            videoRef.current.style.transform = mirrorMode ? '' : 'scaleX(-1)';
          }
          addResult(mirrorMode ? '✓ Ayna görünümü kapandı' : '✓ Ayna görünümü açıldı', 'success');
        }}
        className="px-3 py-2 bg-pink-200 hover:bg-pink-300 text-pink-700 rounded-lg flex items-center gap-2"
      >
        <Download size={16} style={{ transform: 'rotate(90deg)' }} />
        {mirrorMode ? 'Ayna Kapalı' : 'Ayna Açık'}
      </button>

      <button
        onClick={() => setCameraZoom(Math.min(2, cameraZoom + 0.25))}
        disabled={cameraZoom >= 2}
        className="px-3 py-2 bg-cyan-200 hover:bg-cyan-300 text-cyan-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
      >
        <ZoomIn size={16} />
        Yakınlaştır
      </button>

      <button
        onClick={() => setCameraZoom(Math.max(1, cameraZoom - 0.25))}
        disabled={cameraZoom <= 1}
        className="px-3 py-2 bg-orange-200 hover:bg-orange-300 text-orange-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
      >
        <ZoomOut size={16} />
        Uzaklaştır
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <Camera size={36} />
              OMR Form Okuyucu - Canlı Kamera Modu
            </h1>
            <p className="text-blue-100 mt-2 flex items-center gap-2">
              <Scan size={16} />
              Formu kameranın önüne yerleştirin, otomatik okunacaktır
            </p>
          </div>

          <div className="p-6 space-y-4 bg-gray-50 border-b">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-4">
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
                
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
                  <h3 className="font-bold text-green-800 mb-3 flex items-center gap-2">
                    <Camera size={18} />
                    Canlı Kamera Okuma
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (!isCameraActive) {
                            startCamera();
                          }
                        }}
                        disabled={isCameraActive}
                        className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
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
                      onClick={manualCaptureAndProcess}
                      disabled={!isCameraActive || !jsonTemplate}
                      className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center justify-center gap-2"
                    >
                      <Scan size={16} />
                      MANUEL YAKALA ve İŞLE
                    </button>
                    
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="autoCapture"
                          checked={isAutoCaptureMode}
                          onChange={(e) => setIsAutoCaptureMode(e.target.checked)}
                          className="h-4 w-4 text-green-600 rounded focus:ring-green-500"
                        />
                        <label htmlFor="autoCapture" className="ml-2 text-sm text-gray-700">
                          Otomatik Yakalama
                        </label>
                      </div>
                      
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="showGuide"
                          checked={showFormPlacementGuide}
                          onChange={(e) => setShowFormPlacementGuide(e.target.checked)}
                          className="h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="showGuide" className="ml-2 text-sm text-gray-700">
                          Yerleştirme Kılavuzu
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-green-100">
                    <div className="text-sm text-gray-600">
                      <p className="font-medium mb-1">📋 <strong>Kullanım Talimatları:</strong></p>
                      <ol className="list-decimal pl-5 space-y-1">
                        <li>JSON şablonunu yükleyin</li>
                        <li>Formu kameranın önüne yerleştirin</li>
                        <li>Formun 4 köşesi otomatik tespit edilecek</li>
                        <li>Form tanındığında otomatik okunacak</li>
                        <li>Sonuçlar aşağıda görüntülenecek</li>
                      </ol>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                  <AlertCircle size={16} />
                  Sistem Durumu
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`p-3 rounded-lg ${isCameraActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      <div className="text-sm font-medium">Kamera</div>
                      <div className="text-lg font-bold">{isCameraActive ? 'Aktif ✓' : 'Pasif'}</div>
                    </div>
                    <div className={`p-3 rounded-lg ${jsonTemplate ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      <div className="text-sm font-medium">JSON Şablon</div>
                      <div className="text-lg font-bold">{jsonTemplate ? 'Yüklü ✓' : 'Bekliyor'}</div>
                    </div>
                    <div className={`p-3 rounded-lg ${alignmentStatus === 'aligned' ? 'bg-green-100 text-green-700' : alignmentStatus === 'scanning' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                      <div className="text-sm font-medium">Form Durumu</div>
                      <div className="text-lg font-bold">
                        {alignmentStatus === 'waiting' ? 'Bekliyor' :
                         alignmentStatus === 'scanning' ? 'Aranıyor' :
                         alignmentStatus === 'partial' ? 'Kısmen' :
                         'Tanındı ✓'}
                      </div>
                    </div>
                    <div className={`p-3 rounded-lg ${processedData ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      <div className="text-sm font-medium">İşlenmiş Form</div>
                      <div className="text-lg font-bold">{processedData ? 'Var ✓' : 'Yok'}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${
                        alignmentStatus === 'waiting' ? 'bg-gray-400' :
                        alignmentStatus === 'scanning' ? 'bg-yellow-500' :
                        alignmentStatus === 'partial' ? 'bg-blue-500' :
                        'bg-green-500'
                      }`}></div>
                      <span className="font-medium">Form Tespit Durumu:</span>
                      <span className={`font-medium ${
                        alignmentStatus === 'waiting' ? 'text-gray-600' :
                        alignmentStatus === 'scanning' ? 'text-yellow-600' :
                        alignmentStatus === 'partial' ? 'text-blue-600' :
                        'text-green-600'
                      }`}>
                        {alignmentStatus === 'waiting' ? 'Form bekleniyor' :
                         alignmentStatus === 'scanning' ? 'Form aranıyor' :
                         alignmentStatus === 'partial' ? `${detectedCorners.length}/4 köşe bulundu` :
                         'Form tanındı ✓'}
                      </span>
                    </div>
                    
                    {jsonTemplate && (
                      <div className="mt-2 p-2 bg-white rounded border border-blue-200">
                        <div className="text-sm">
                          <div className="font-medium text-blue-700">Yüklenen Şablon:</div>
                          <div className="truncate">{jsonTemplate.name}</div>
                          {jsonTemplate.parsed?.template_info && (
                            <div className="text-xs text-gray-500 mt-1">
                              {jsonTemplate.parsed.template_info.title} • 
                              {jsonTemplate.parsed.template_info.question_count} soru • 
                              {jsonTemplate.parsed.template_info.option_count} şık
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-b">
            <div className="flex overflow-x-auto">
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
              <TabButton
                active={activeTab === 'student'}
                onClick={() => setActiveTab('student')}
                label="Yakalanan Form"
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
            </div>
          </div>

          <div className="p-6 bg-white" style={{ minHeight: '500px', maxHeight: '600px', overflow: 'auto' }}>
            {activeTab === 'camera' && (
              <div className="flex flex-col items-center justify-center">
                {isCameraActive ? (
                  <div className="relative w-full max-w-4xl">
                    <div className={`relative rounded-xl overflow-hidden border-4 ${cameraFrameColor} transition-all duration-300 shadow-2xl`}>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        className="w-full h-auto"
                        onLoadedMetadata={startScanning}
                        style={{
                          transform: mirrorMode ? 'scaleX(-1)' : '',
                          zoom: cameraZoom
                        }}
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
                              className="absolute w-8 h-8 border-2 border-white bg-blue-600 rounded-full transform -translate-x-1/2 -translate-y-1/2 animate-pulse shadow-lg"
                              style={{ left: `${corner.x}px`, top: `${corner.y}px` }}
                            >
                              <div className="w-full h-full flex items-center justify-center text-white text-sm font-bold">
                                {index + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {showFormPlacementGuide && (
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                            <div className="w-64 h-64 border-4 border-dashed border-white opacity-70 rounded-xl"></div>
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white text-center">
                              <div className="bg-black bg-opacity-70 px-4 py-2 rounded-lg">
                                <Target size={24} className="mx-auto mb-2" />
                                <p className="font-bold">FORMU BURAYA YERLEŞTİRİN</p>
                                <p className="text-sm">Köşeler görünür olsun</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {isScanning && (
                        <div className="absolute top-4 left-4 bg-black bg-opacity-80 text-white px-4 py-2 rounded-lg text-sm font-medium animate-pulse shadow-lg">
                          <Scan className="inline mr-2" size={16} />
                          FORM TARANIYOR...
                        </div>
                      )}
                      
                      <div className={`absolute top-4 right-4 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
                        alignmentStatus === 'waiting' ? 'bg-gray-700 text-white' :
                        alignmentStatus === 'scanning' ? 'bg-yellow-500 text-white' :
                        alignmentStatus === 'partial' ? 'bg-blue-500 text-white' :
                        'bg-green-500 text-white'
                      }`}>
                        {alignmentStatus === 'waiting' ? '⏳ FORMU BEKLİYOR' :
                         alignmentStatus === 'scanning' ? '🔍 FORM ARANIYOR' :
                         alignmentStatus === 'partial' ? `📐 ${detectedCorners.length}/4 KÖŞE BULUNDU` :
                         '✅ FORM TANINDI!'}
                      </div>
                      
                      {isAutoCaptureMode && alignmentStatus === 'aligned' && (
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-lg font-bold animate-pulse shadow-lg">
                          ⚡ OTOMATİK YAKALANACAK
                        </div>
                      )}
                    </div>
                    
                    <CameraControls />
                    
                    <div className="mt-6 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-lg border border-blue-200">
                      <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                        <Target size={18} />
                        Form Yerleştirme Talimatları
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-700 mb-2">
                            📱 <strong>Formu kameranın önüne şu şekilde yerleştirin:</strong>
                          </p>
                          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                            <li>Formun 4 köşesindeki mavi çemberler görünsün</li>
                            <li>Form ekrana tam otursun, eğik olmasın</li>
                            <li>Işık yeterli olsun, gölge oluşmasın</li>
                            <li>Form kameraya paralel olsun</li>
                            <li>Ekrandaki kare içine formu hizalayın</li>
                          </ul>
                        </div>
                        <div>
                          <p className="text-sm text-gray-700 mb-2">
                            ⚙️ <strong>Sistem özellikleri:</strong>
                          </p>
                          <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                            <li><strong>Otomatik Yakalama:</strong> {isAutoCaptureMode ? 'Açık' : 'Kapalı'}</li>
                            <li><strong>Form Tespiti:</strong> {alignmentStatus === 'aligned' ? 'Başarılı' : 'Bekliyor'}</li>
                            <li><strong>Tespit Edilen Köşe:</strong> {detectedCorners.length}/4</li>
                            <li><strong>JSON Şablon:</strong> {jsonTemplate ? 'Yüklü' : 'Bekliyor'}</li>
                            <li><strong>Kamera:</strong> {isCameraActive ? 'Aktif' : 'Pasif'}</li>
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center text-gray-400 py-12">
                    <Camera size={80} className="mx-auto mb-6 opacity-50" />
                    <p className="text-2xl font-medium mb-2">Kamera Kapalı</p>
                    <p className="text-gray-500 max-w-md mx-auto mb-6">
                      Formları hızlıca okumak için kamerayı açın. Formun 4 köşesindeki mavi çemberler otomatik olarak tespit edilecek ve form tanındığında otomatik olarak işlenecek.
                    </p>
                    <button
                      onClick={startCamera}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-lg transition-all flex items-center justify-center gap-2 mx-auto"
                    >
                      <Camera size={20} />
                      Kamerayı Aç
                    </button>
                  </div>
                )}
                
                <canvas ref={cameraCanvasRef} className="hidden" />
              </div>
            )}
            
            {activeTab === 'student' && (
              <div className="flex flex-col items-center justify-center h-full">
                {capturedImage || studentForm ? (
                  <div className="text-center w-full">
                    <div className="bg-green-50 p-4 rounded-lg mb-4 border border-green-200">
                      <div className="flex items-center justify-center gap-2 text-green-700 font-medium">
                        <Camera size={20} />
                        Yakalanan Form Görüntüsü
                      </div>
                    </div>
                    <img 
                      src={capturedImage || studentForm?.data} 
                      alt="Yakalanan Form" 
                      className="max-h-72 object-contain mx-auto border-2 border-gray-200 rounded-lg shadow-md" 
                    />
                    <p className="text-sm text-gray-500 mt-3">
                      {studentForm?.name || 'Kameradan yakalanan form'}
                    </p>
                    <div className="mt-4 flex gap-3 justify-center">
                      <button
                        onClick={() => setActiveTab('camera')}
                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all flex items-center gap-2"
                      >
                        <Camera size={16} />
                        Kameraya Dön
                      </button>
                      <button
                        onClick={simulateOMRProcessingReader}
                        disabled={!jsonTemplate || isProcessing}
                        className="px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg transition-all flex items-center gap-2"
                      >
                        <Scan size={16} />
                        {isProcessing ? 'İşleniyor...' : 'Formu İşle'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <p className="text-gray-400 italic text-lg">Henüz form yakalanmadı</p>
                    <p className="text-gray-500 mt-2">Lütfen kamerayı kullanarak form yakalayın</p>
                    <button
                      onClick={() => setActiveTab('camera')}
                      className="mt-4 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all flex items-center gap-2 mx-auto"
                    >
                      <Camera size={16} />
                      Kameraya Git
                    </button>
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'json' && (
              <div className="h-full overflow-auto">
                {jsonTemplate ? (
                  <div>
                    <div className="bg-blue-50 p-4 rounded-lg mb-4 border border-blue-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-blue-700 font-medium">
                          <BookOpen size={20} />
                          JSON Şablon Bilgileri
                        </div>
                        <button
                          onClick={() => setActiveTab('camera')}
                          className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-all"
                        >
                          Kameraya Dön
                        </button>
                      </div>
                      {jsonTemplate.parsed?.template_info && (
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div><span className="font-medium">Başlık:</span> {jsonTemplate.parsed.template_info.title}</div>
                          <div><span className="font-medium">Soru Sayısı:</span> {jsonTemplate.parsed.template_info.question_count}</div>
                          <div><span className="font-medium">Şık Sayısı:</span> {jsonTemplate.parsed.template_info.option_count}</div>
                          <div><span className="font-medium">Cevap Anahtarı:</span> {Object.keys(jsonTemplate.parsed.answer_key || {}).length} soru</div>
                        </div>
                      )}
                    </div>
                    <pre className="text-sm bg-gray-50 p-4 rounded font-mono max-h-96 overflow-auto">
                      {typeof jsonTemplate.data === 'string' 
                        ? jsonTemplate.data 
                        : JSON.stringify(jsonTemplate.parsed, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <p className="text-gray-400 italic text-center pt-24">JSON şablonu yüklenmedi</p>
                )}
              </div>
            )}
            
            {activeTab === 'answerKey' && (
              <div className="flex items-center justify-center h-full">
                {answerKeyForm ? (
                  <div className="text-center">
                    <img src={answerKeyForm.data} alt="Cevap Anahtarı" className="max-h-64 object-contain mx-auto" />
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
                    <img src={studentForm.data} alt="Öğrenci Formu" className="max-h-48 object-contain mx-auto opacity-75" />
                  </div>
                ) : (
                  <p className="text-gray-400 italic">Cevap anahtarı formu yüklenmedi</p>
                )}
              </div>
            )}
          </div>

          <div className="p-6 bg-gray-50 border-t flex gap-4">
            <button
              onClick={manualCaptureAndProcess}
              disabled={!isCameraActive || !jsonTemplate || isProcessing}
              className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  İŞLENİYOR...
                </>
              ) : (
                <>
                  <Scan size={20} />
                  MANUEL YAKALA ve İŞLE
                </>
              )}
            </button>
            
            <button
              onClick={openEditMode}
              disabled={!processedData}
              className="flex-1 bg-gradient-to-r from-cyan-500 to-cyan-600 hover:from-cyan-600 hover:to-cyan-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
            >
              <Pencil size={20} />
              OKUNAN VERİLERİ DÜZENLE
            </button>
          </div>

          {isOcrProcessing && (
            <div className="p-6 bg-gradient-to-r from-blue-50 to-cyan-50 border-t">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="animate-spin text-blue-600" size={24} />
                <div className="flex-1">
                  <div className="text-blue-700 font-medium mb-1">OCR İŞLENİYOR...</div>
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
        </div>

        <div className="mt-6 text-center text-gray-600 text-sm">
          <p><strong>OMR Form Okuyucu - Canlı Kamera Modu</strong> | Formu kameranın önüne yerleştirin, otomatik okunsun!</p>
          <p className="mt-1">
            <span className="font-medium">Özellikler:</span> 
            <span className="ml-2">• Otomatik kamera açma</span>
            <span className="ml-2">• Form köşe tespiti</span>
            <span className="ml-2">• Otomatik/manuel yakalama</span>
            <span className="ml-2">• Canlı görüntü işleme</span>
            <span className="ml-2">• Gerçek zamanlı sonuçlar</span>
          </p>
        </div>
      </div>

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
                        <div className="mt-1 text-xs text-yellow-600">
                          ⚠️ Değer değiştirildi. Orijinal OCR değeri: {processedData.ocr.className}
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
                        placeholder={processedData?.ocr?.name || "Ad"}
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
                        placeholder={processedData?.ocr?.surname || "Soyad"}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-green-50 p-6 rounded-xl border border-green-200">
                  <h3 className="text-lg font-bold text-green-800 mb-4 flex items-center gap-2">
                    <CheckSquare size={20} />
                    Öğrenci Cevapları
                    {processedData?.stats && (
                      <span className="ml-auto text-sm bg-purple-100 text-purple-700 px-2 py-1 rounded">
                        Puan: {processedData.stats.score}
                      </span>
                    )}
                  </h3>
                  
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Soru No</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Öğrenci Cevabı</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Doğru Cevap</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Durum</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {Object.keys(editedData.answers).sort((a, b) => parseInt(a) - parseInt(b)).map(questionNum => (
                          <tr key={questionNum}>
                            <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                              {questionNum}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <select
                                value={editedData.answers[questionNum] || '-'}
                                onChange={(e) => updateAnswerInEditMode(questionNum, e.target.value)}
                                className="border border-gray-300 rounded px-2 py-1 text-sm"
                              >
                                <option value="-">-</option>
                                <option value="A">A</option>
                                <option value="B">B</option>
                                <option value="C">C</option>
                                <option value="D">D</option>
                                <option value="E">E</option>
                              </select>
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-500">
                              {processedData?.correctAnswers?.[questionNum] || '-'}
                            </td>
                            <td className="px-4 py-2 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                editedData.answers[questionNum] === '-'
                                  ? 'bg-gray-100 text-gray-700'
                                  : editedData.answers[questionNum] === processedData?.correctAnswers?.[questionNum]
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {editedData.answers[questionNum] === '-' ? 'Boş' :
                                 editedData.answers[questionNum] === processedData?.correctAnswers?.[questionNum] ? 'Doğru' : 'Yanlış'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  
                  {processedData?.stats && (
                    <div className="mt-4 pt-4 border-t border-green-100">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-600">{processedData.stats.correct}</div>
                          <div className="text-xs text-gray-600">Doğru</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-red-600">{processedData.stats.incorrect}</div>
                          <div className="text-xs text-gray-600">Yanlış</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-gray-600">{processedData.stats.blank}</div>
                          <div className="text-xs text-gray-600">Boş</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600">{processedData.stats.score}</div>
                          <div className="text-xs text-gray-600">Puan</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 border-t flex justify-end gap-3">
              <button
                onClick={() => setEditMode(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium rounded-lg transition-all"
              >
                İptal
              </button>
              <button
                onClick={saveEditedData}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-lg transition-all flex items-center gap-2"
              >
                <Save size={16} />
                Kaydet
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OMRFormReader;
