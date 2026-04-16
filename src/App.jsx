import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { 
  Heart, 
  Calendar, 
  MapPin, 
  Clock, 
  Music, 
  Volume2, 
  VolumeX, 
  ChevronDown, 
  Send,
  Users,
  Upload,
  QrCode,
  X,
  CheckCircle2,
  Copy,
  Sparkles,
  Headphones,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  onSnapshot, 
  query 
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken 
} from 'firebase/auth';

// --- Configuration & API URLs ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'wedding-digital-invitation';
const apiKey = ""; // API Key for Gemini provided at runtime

// *** นำ Web App URL ที่ได้จาก Google Apps Script มาใส่ตรงนี้ ***
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOss1HkbdlMUoNV2yH-EYqZJ_NcN2swLHsa4bS0qTDBikcv4nlxAHWC_hn-y3NvDT0/exec"; 

const WEDDING_DATE = new Date('2026-06-14T09:00:00');

const IMAGES = {
  hero: "https://images.unsplash.com/photo-1583939003579-730e3918a45a?q=80&w=1974&auto=format&fit=crop",
  story1: "https://images.unsplash.com/photo-1519741497674-611481863552?q=80&w=2070&auto=format&fit=crop",
  story2: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?q=80&w=2069&auto=format&fit=crop",
  story3: "https://images.unsplash.com/photo-1522673607200-16488352475b?q=80&w=2070&auto=format&fit=crop",
  qrGroom: "https://raw.githubusercontent.com/BorbbangZar/Digital-Wedding-Invitation/main/S__118997007.jpg", 
  qrBride: "https://raw.githubusercontent.com/BorbbangZar/Digital-Wedding-Invitation/main/S__95141890.jpg", 
};

// --- Gemini API Helpers ---
const callGemini = async (prompt, systemInstruction = "", retries = 5) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] }
        })
      });
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
};

const callGeminiTTS = async (text, voice = "Kore", retries = 5) => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
          }
        })
      });
      if (!response.ok) throw new Error('TTS API Error');
      const data = await response.json();
      const pcmBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      return pcmBase64;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
};

const pcmToWav = (base64Pcm, sampleRate = 24000) => {
  try {
    const pcmData = Uint8Array.from(atob(base64Pcm), c => c.charCodeAt(0));
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);
    view.setUint32(0, 0x52494646, false);
    view.setUint32(4, 36 + pcmData.length, true);
    view.setUint32(8, 0x57415645, false);
    view.setUint32(12, 0x666d7420, false);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    view.setUint32(36, 0x64617461, false);
    view.setUint32(40, pcmData.length, true);
    const blob = new Blob([wavHeader, pcmData], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error("PCM conversion failed", err);
    return null;
  }
};

// --- Components ---

const Section = ({ children, className = "", id = "" }) => (
  <motion.section
    id={id}
    initial={{ opacity: 0, y: 50 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.15 }}
    transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
    className={`min-h-screen relative flex flex-col items-center justify-center py-20 px-6 ${className}`}
  >
    {children}
  </motion.section>
);

const CountdownTimer = () => {
  const [timeLeft, setTimeLeft] = useState({ วัน: 0, ชม: 0, นาที: 0, วิ: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const diff = WEDDING_DATE.getTime() - now.getTime();
      if (diff <= 0) return clearInterval(timer);
      setTimeLeft({
        วัน: Math.floor(diff / (1000 * 60 * 60 * 24)),
        ชม: Math.floor((diff / (1000 * 60 * 60)) % 24),
        นาที: Math.floor((diff / 1000 / 60) % 60),
        วิ: Math.floor((diff / 1000) % 60),
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex justify-center gap-4 mt-8">
      {Object.entries(timeLeft).map(([label, value]) => (
        <div key={label} className="flex flex-col items-center bg-white/10 backdrop-blur-md px-4 py-3 rounded-2xl border border-white/20 min-w-[70px]">
          <span className="text-2xl font-serif font-bold text-white">{value}</span>
          <span className="text-[9px] uppercase tracking-widest text-white/60">{label}</span>
        </div>
      ))}
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeQr, setActiveQr] = useState(null);
  const [rsvpStatus, setRsvpStatus] = useState('idle');
  const [giftStatus, setGiftStatus] = useState('idle');
  const [formData, setFormData] = useState({ name: '', guests: 1, message: '' });
  const [giftData, setGiftData] = useState({ name: '', slipFile: null, slipPreview: null });
  
  // AI States
  const [isGeneratingWish, setIsGeneratingWish] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const audioRef = useRef(null);
  const ttsAudioRef = useRef(new Audio());

  const { scrollYProgress } = useScroll();
  const yHero = useTransform(scrollYProgress, [0, 0.3], [0, -150]);
  const opacityHero = useTransform(scrollYProgress, [0, 0.25], [1, 0]);

  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (formData.name) {
      setGiftData(prev => ({ ...prev, name: formData.name }));
    }
  }, [formData.name]);

  const toggleMusic = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  };

  const handleAiWishGenerate = async () => {
    setIsGeneratingWish(true);
    try {
      const prompt = "เขียนคำอวยพรงานแต่งงานสั้นๆ สำหรับคู่รักชื่อ Rohanee และ Vitoon ให้หน่อย เอาแบบที่เป็นกันเองและดูจริงใจ ไม่เกิน 2 ประโยค";
      const systemPrompt = "คุณคือผู้เชี่ยวชาญด้านการเขียนคำอวยพรงานแต่งงานที่อบอุ่นและสร้างสรรค์";
      const wish = await callGemini(prompt, systemPrompt);
      if (wish) setFormData(prev => ({ ...prev, message: wish.trim().replace(/"/g, '') }));
    } catch (err) { console.error(err); } 
    finally { setIsGeneratingWish(false); }
  };

  const handleReadAloud = async () => {
    if (isReadingAloud) {
      ttsAudioRef.current.pause();
      setIsReadingAloud(false);
      return;
    }
    setIsReadingAloud(true);
    try {
      const textToRead = "ยินดีต้อนรับสู่งานฉลองมงคลสมรสของ คุณโรฮานี และ คุณวิฑูรย์ วันอาทิตย์ที่ 14 มิถุนายน 2569 ณ ร้านอาหารปากน้ำซีฟู๊ด กระบี่ พวกเราเฝ้ารอที่จะพบคุณในวันสำคัญนี้นะคะ";
      const pcmData = await callGeminiTTS(`Say cheerfully in Thai: ${textToRead}`);
      const wavUrl = pcmToWav(pcmData);
      if (ttsAudioRef.current.src) URL.revokeObjectURL(ttsAudioRef.current.src);
      ttsAudioRef.current.src = wavUrl;
      ttsAudioRef.current.play();
      ttsAudioRef.current.onended = () => setIsReadingAloud(false);
    } catch (err) { setIsReadingAloud(false); }
  };

  // Helper for Google Sheets upload
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setGiftData({ ...giftData, slipFile: file, slipPreview: URL.createObjectURL(file) });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setGiftData({ ...giftData, slipFile: file, slipPreview: URL.createObjectURL(file) });
    }
  };

  const handleGiftSubmit = async (e) => {
    e.preventDefault();
    if (!user || !giftData.name || !giftData.slipFile) return;
    setGiftStatus('sending');
    try {
      // 1. Convert image to Base64
      const base64Image = await fileToBase64(giftData.slipFile);
      
      // 2. Send to Google Sheets (Gifts sheet)
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gift',
          name: giftData.name,
          image: base64Image
        })
      });

      // 3. Backup to Firebase
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'gifts'), {
        name: giftData.name,
        timestamp: new Date().toISOString(),
        userId: user.uid
      });

      setGiftStatus('success');
      setGiftData({ name: formData.name, slipFile: null, slipPreview: null });
      setTimeout(() => setGiftStatus('idle'), 5000);
    } catch (e) { 
      setGiftStatus('error');
    }
  };

  const handleRsvpSubmit = async (e) => {
    e.preventDefault();
    if (!user || !formData.name) return;
    setRsvpStatus('sending');
    try {
      // 1. Send to Google Sheets (RSVPs sheet)
      await fetch(GOOGLE_SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rsvp',
          ...formData
        })
      });

      // 2. Backup to Firebase
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'rsvps'), {
        ...formData,
        timestamp: new Date().toISOString(),
        userId: user.uid
      });

      setRsvpStatus('success');
      setFormData({ name: '', guests: 1, message: '' });
      setTimeout(() => setRsvpStatus('idle'), 5000);
    } catch (e) { 
      setRsvpStatus('error');
    }
  };

  return (
    <div className="bg-[#FAF7F2] text-[#4A4238] font-sans selection:bg-[#D4AF37]/30 overflow-x-hidden">
      <audio ref={audioRef} loop src="https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808d3090c.mp3?filename=lofi-study-112191.mp3" />
      
      <div className="fixed bottom-8 right-8 z-50 flex flex-col gap-4">
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={handleReadAloud} className={`p-4 backdrop-blur-md border border-[#D4AF37]/20 rounded-full shadow-2xl transition-colors ${isReadingAloud ? 'bg-[#D4AF37] text-white' : 'bg-white/90 text-[#D4AF37]'}`}>
          {isReadingAloud ? <Loader2 size={24} className="animate-spin" /> : <Headphones size={24} />}
        </motion.button>
        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={toggleMusic} className="p-4 bg-white/90 backdrop-blur-md border border-[#D4AF37]/20 text-[#D4AF37] rounded-full shadow-2xl">
          {isPlaying ? <Volume2 size={24} /> : <VolumeX size={24} />}
        </motion.button>
      </div>

      {/* 1. Hero */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <motion.div style={{ y: yHero, opacity: opacityHero }} className="absolute inset-0 z-0">
          <img src={IMAGES.hero} alt="Wedding" className="w-full h-full object-cover brightness-[0.7]" />
        </motion.div>
        <div className="relative z-10 text-center text-white px-6">
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-s uppercase tracking-[0.5em] mb-4 font-light">ยินดีต้อนรับสู่งานวิวาห์ของ</motion.p>
          <motion.h1 initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 1 }} className="text-6xl md:text-8xl font-serif font-bold mb-6">Rohanee & Vitoon</motion.h1>
          <div className="h-px w-20 bg-white/40 mx-auto mb-8" />
          <p className="text-2xl font-serif italic mb-4">วันอาทิตย์ที่ 14 มิถุนายน 2569</p>
          <button onClick={handleReadAloud} className="mb-8 flex items-center gap-2 mx-auto bg-white/20 hover:bg-white/30 px-4 py-2 rounded-full backdrop-blur-sm transition-all text-xs border border-white/30">
            {isReadingAloud ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>✨ ฟังเสียงอ่านการ์ด</span>
          </button>
          <CountdownTimer />
        </div>
        <motion.div animate={{ y: [0, 15, 0] }} transition={{ repeat: Infinity, duration: 2.5 }} className="absolute bottom-10 text-white/50"><ChevronDown size={30} /></motion.div>
      </section>

      {/* 2. Story */}
      <Section className="bg-white">
        <div className="max-w-4xl text-center">
          <Heart className="mx-auto text-[#D4AF37] mb-8" size={32} />
          <h2 className="text-4xl font-serif mb-10">เรื่องราวของเรา</h2>
          <p className="text-lg leading-relaxed text-[#6B5E4F] italic mb-12 max-w-2xl mx-auto">"การเดินทางที่เริ่มต้นด้วยคำทักทายง่ายๆ จนกลายเป็นรักที่สวยงามและยั่งยืนตลอดไป"</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[IMAGES.story1, IMAGES.story2, IMAGES.story3].map((img, i) => (
              <motion.div key={i} whileHover={{ y: -10 }} className="aspect-[3/4] rounded-[2rem] overflow-hidden shadow-xl border-8 border-[#FAF7F2]">
                <img src={img} alt="Story" className="w-full h-full object-cover" />
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* 3. Schedule */}
      <Section className="bg-[#F3EFE9]">
        <div className="max-w-2xl w-full">
          <h2 className="text-4xl font-serif text-center mb-16 underline decoration-[#D4AF37]/30 underline-offset-8">กำหนดการ</h2>
          <div className="space-y-10 relative before:absolute before:left-8 before:top-2 before:bottom-2 before:w-px before:bg-[#D4AF37]/30">
            {[
              { time: "09:09 น.", title: "Ring Ceremony", desc: "พิธีสวมแหวนหมั้น", icon: <Calendar /> },
              { time: "11:00 น.", title: "Water Pouring", desc: "พิธีหลั่งน้ำพระพุทธมนต์", icon: <Heart /> },
              { time: "18:00 น.", title: "Wedding Reception", desc: "งานเลี้ยงฉลองมงคลสมรส", icon: <Music /> },
            ].map((ev, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.2 }} className="relative pl-20 group">
                <div className="absolute left-6 -translate-x-1/2 w-4 h-4 rounded-full bg-[#D4AF37] ring-8 ring-[#F3EFE9] group-hover:scale-125 transition-transform" />
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-[#D4AF37]/5">
                  <span className="text-[#D4AF37] font-bold text-sm tracking-tighter">{ev.time}</span>
                  <h3 className="text-xl font-serif font-bold mt-1">{ev.title}</h3>
                  <p className="text-sm text-[#6B5E4F] mt-1">{ev.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* 4. Location */}
      <Section className="bg-white">
        <div className="max-w-4xl w-full text-center">
          <MapPin className="mx-auto text-[#D4AF37] mb-6" size={32} />
          <h2 className="text-4xl font-serif mb-4">สถานที่จัดงาน</h2>
          <p className="text-xl font-serif mb-10 italic">ร้านอาหารปากน้ำซีฟู๊ด ,กระบี่</p>
          <div className="aspect-video w-full rounded-[2.5rem] overflow-hidden shadow-2xl border-8 border-[#F3EFE9] mb-8">
            <iframe 
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d800.684123512345!2d98.9153315!3d8.0474812!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zOMKwMDInNTEuMCJOIDk4wrA1NCc1NS4yIkU!5e0!3m2!1sth!2sth!4v1715690000000" 
              width="100%" height="100%" style={{ border: 0 }} loading="lazy" title="Map" 
            />
          </div>
          <a href="https://maps.app.goo.gl/PQ2cQDx8da3w3wLDA" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-[#4A4238] text-white px-10 py-4 rounded-full hover:bg-black transition-all hover:scale-105">เปิดใน Google Maps</a>
        </div>
      </Section>

      {/* 5. RSVP */}
      <Section className="bg-white">
        <div className="max-w-md w-full bg-[#FAF7F2] p-8 md:p-12 rounded-[2.5rem] shadow-xl border border-[#D4AF37]/10">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-serif mb-3">RSVP</h2>
            <p className="text-sm text-[#6B5E4F]">ยืนยันการร่วมงานภายในวันที่ 15 พ.ค. 2569</p>
          </div>
          <form onSubmit={handleRsvpSubmit} className="space-y-6">
            <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="ระบุชื่อ-นามสกุล" className="w-full bg-white border-none rounded-xl p-4 shadow-sm focus:ring-2 focus:ring-[#D4AF37]" />
            <select value={formData.guests} onChange={e => setFormData({...formData, guests: parseInt(e.target.value)})} className="w-full bg-white border-none rounded-xl p-4 shadow-sm">
              {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} ท่าน</option>)}
            </select>
            <div className="relative">
              <textarea rows="3" value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} placeholder="เขียนคำอวยพรให้คู่บ่าวสาว..." className="w-full bg-white border-none rounded-xl p-4 shadow-sm resize-none pr-12" />
              <button type="button" onClick={handleAiWishGenerate} disabled={isGeneratingWish} className="absolute right-4 bottom-4 p-2 bg-[#D4AF37]/10 text-[#D4AF37] rounded-full hover:bg-[#D4AF37] hover:text-white transition-all disabled:opacity-50">
                {isGeneratingWish ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-right text-[#D4AF37] font-medium italic">✨ ให้ AI ช่วยคิดคำอวยพรให้คุณ</p>
            <button disabled={rsvpStatus === 'sending'} className="w-full bg-[#4A4238] text-white py-4 rounded-xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2">
              {rsvpStatus === 'sending' ? <Loader2 className="animate-spin" size={18}/> : null}
              <span>{rsvpStatus === 'sending' ? 'กำลังส่งข้อมูล...' : 'ส่งการยืนยัน'}</span>
            </button>
            {rsvpStatus === 'success' && <p className="text-center text-green-600 text-sm font-bold">ขอบคุณสำหรับการตอบรับนะคะ! ✨</p>}
            {rsvpStatus === 'error' && <p className="text-center text-red-500 text-sm font-bold flex items-center justify-center gap-1"><AlertCircle size={14}/> เกิดข้อผิดพลาด กรุณาลองใหม่</p>}
          </form>
        </div>
      </Section>

      {/* 6. Gift */}
      <Section id="gift" className="bg-[#F9F5EF] overflow-hidden">
        <div className="max-w-6xl w-full mx-auto">
          <motion.div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-serif mb-4">ของขวัญพิเศษแด่คู่บ่าวสาว</h2>
            <div className="h-[2px] w-16 bg-[#D4AF37]/30 mx-auto mb-6" />
            <p className="text-[#6B5E4F] max-w-lg mx-auto italic text-base">"เพื่อเป็นการแสดงความขอบคุณสำหรับการมาร่วมงาน หากท่านประสงค์จะมอบของขวัญแก่คู่บ่าวสาว ท่านสามารถดำเนินการผ่านช่องทางด้านล่างนี้"</p>
          </motion.div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} className="bg-white/70 backdrop-blur-md p-8 md:p-10 rounded-[2.5rem] shadow-xl border border-white/50">
              <h3 className="text-2xl font-serif mb-8 flex items-center gap-3"><Send size={20} className="text-[#D4AF37]" /> ส่งสลิปแจ้งโอน</h3>
              <form onSubmit={handleGiftSubmit} className="space-y-6">
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-[#D4AF37] block mb-2">ชื่อผู้ฝากของขวัญ</label>
                  <input required type="text" value={giftData.name} onChange={e => setGiftData({...giftData, name: e.target.value})} placeholder="ระบุชื่อ-นามสกุล ของท่าน" className="w-full bg-[#FAF7F2] border-none rounded-2xl p-4 shadow-inner focus:ring-2 focus:ring-[#D4AF37] transition-all" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest font-bold text-[#D4AF37] block mb-2">อัปโหลดหลักฐาน</label>
                  <div onDragOver={e => e.preventDefault()} onDrop={handleDrop} className="relative group cursor-pointer">
                    <input type="file" id="slip" accept="image/*" className="hidden" onChange={handleFileChange} />
                    <label htmlFor="slip" className={`flex flex-col items-center justify-center min-h-[180px] rounded-2xl border-2 border-dashed transition-all ${giftData.slipPreview ? 'border-green-300 bg-green-50/20' : 'border-[#D4AF37]/30 hover:border-[#D4AF37] bg-[#FAF7F2]'}`}>
                      {giftData.slipPreview ? (
                        <div className="p-4 text-center">
                          <img src={giftData.slipPreview} alt="Slip" className="h-28 mx-auto rounded-lg mb-2 object-contain" />
                          <p className="text-xs text-green-600 font-bold flex items-center justify-center gap-1"><CheckCircle2 size={12}/> เลือกไฟล์เรียบร้อย</p>
                        </div>
                      ) : (
                        <div className="text-center p-6">
                          <Upload className="mx-auto text-[#D4AF37] mb-3" size={32} />
                          <p className="text-sm font-medium">คลิกหรือลากสลิปมาวางที่นี่</p>
                        </div>
                      )}
                    </label>
                  </div>
                </div>
                <button disabled={giftStatus === 'sending' || !giftData.slipFile} className="w-full bg-[#D4AF37] text-white py-4 rounded-2xl font-bold shadow-lg hover:shadow-2xl disabled:opacity-50 flex items-center justify-center gap-2">
                  {giftStatus === 'sending' ? <Loader2 className="animate-spin" size={18}/> : null}
                  <span>{giftStatus === 'sending' ? 'กำลังส่งข้อมูลและสลิป...' : 'ยืนยันการส่งของขวัญ'}</span>
                </button>
                {giftStatus === 'success' && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center text-green-600 text-sm font-bold mt-4">ขอบคุณสำหรับความปรารถนาดีค่ะ! ✨</motion.p>}
                {giftStatus === 'error' && <p className="text-center text-red-500 text-sm font-bold flex items-center justify-center gap-1"><AlertCircle size={14}/> เกิดข้อผิดพลาด กรุณาลองใหม่</p>}
              </form>
            </motion.div>
            
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} className="space-y-6">
              {[
                { type: "บัญชีของเจ้าสาว", name: "Rohanee J.", account: "186-3-72925-0", bank: "KBank", qr: IMAGES.qrGroom, theme: "bg-[#4A4238] text-white" },
                { type: "บัญชีของเจ้าบ่าว", name: "Vitoon S.", account: "812-0-29762-8", bank: "KTB", qr: IMAGES.qrBride, theme: "bg-white text-[#4A4238] border border-[#D4AF37]/20 shadow-lg" }
              ].map((acc, i) => (
                <div key={i} onClick={() => setActiveQr(acc)} className={`p-6 rounded-[2rem] flex items-center justify-between cursor-pointer group hover:scale-[1.03] transition-all ${acc.theme}`}>
                  <div className="flex gap-5 items-center">
                    <div className={`p-4 rounded-2xl ${i === 0 ? 'bg-white/10' : 'bg-[#D4AF37]/10'}`}><QrCode size={25} /></div>
                    <div>
                      <p className="text-[10px] uppercase tracking-widest opacity-60 mb-1">{acc.type}</p>
                      <h4 className="text-xl font-serif font-bold">{acc.name}</h4>
                      <p className="text-sm font-mono opacity-80">{acc.bank} : {acc.account}</p>
                    </div>
                  </div>
                  <div className="p-3 bg-[#D4AF37]/10 rounded-full group-hover:bg-[#D4AF37] group-hover:text-white"><ChevronDown size={20} className="-rotate-90" /></div>
                </div>
              ))}
              <div className="p-6 bg-[#D4AF37]/5 rounded-[2rem] border border-[#D4AF37]/20 italic text-base text-center text-[#6B5E4F]">
                "ขออภัย (มาอัฟ) แด่ทุกท่านหากมิได้มาเรียนเชิญด้วยตนเอง"
              </div>
            </motion.div>
          </div>
        </div>
      </Section>

      <footer className="py-16 bg-[#F3EFE9] text-center border-t border-[#D4AF37]/10">
        <p className="text-3xl font-serif font-bold mb-2">Rohanee & Vitoon</p>
        <p className="text-[10px] uppercase tracking-[0.4em] text-[#6B5E4F] opacity-60">ขอบคุณที่เป็นส่วนหนึ่งในวันสำคัญของเรา</p>
        <div className="mt-8 flex justify-center gap-3"><Heart size={18} fill="#D4AF37" className="text-[#D4AF37] animate-pulse" /></div>
      </footer>

      {/* Modal QR */}
      <AnimatePresence>
        {activeQr && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6" onClick={() => setActiveQr(null)}>
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} className="bg-white p-6 rounded-[2rem] max-w-[85vw] md:max-w-sm w-full text-center relative" onClick={e => e.stopPropagation()}>
              <button onClick={() => setActiveQr(null)} className="absolute -top-2 -right-2 bg-white p-2 rounded-full shadow-lg text-gray-500"><X size={20}/></button>
              <h3 className="text-xl md:text-2xl font-serif font-bold mb-4">{activeQr.type}</h3>
              <div className="bg-gray-50 p-4 rounded-2xl mb-4 shadow-inner">
                <img src={activeQr.qr} alt="QR" className="w-full h-auto max-h-[50vh] object-contain" />
              </div>
              <p className="text-xs text-gray-400 mb-1">ชื่อบัญชี: {activeQr.name}</p>
              <div className="flex items-center justify-center gap-2 text-lg md:text-2xl font-bold text-[#4A4238]">
                <span>{activeQr.account}</span>
                <button onClick={() => {
                  const el = document.createElement('textarea'); el.value = activeQr.account; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el);
                }} className="text-[#D4AF37] hover:scale-110 transition-transform"><Copy size={18} /></button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,700;1,400&family=Montserrat:wght@300;400;600&family=Noto+Sans+Thai:wght@300;400;700&display=swap');
        body { font-family: 'Montserrat', 'Noto Sans Thai', sans-serif; scroll-behavior: smooth; }
        h1, h2, h3, h4, .font-serif { font-family: 'Cormorant Garamond', serif; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #D4AF37; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;