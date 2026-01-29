# GitHub'a Proje Yükleme Talimatları

## 5. Adım: Terminalden Projeyi GitHub'a Yükleyin

Aşağıdaki komutları projenizin klasöründe sırayla çalıştırın:

### 1. Git'i yapılandırın (ilk kez kullanıyorsanız):
```bash
git config --global user.name "Adınız Soyadınız"
git config --global user.email "email@example.com"
```

### 2. Proje klasörüne gidin:
```bash
cd omr-project
```

### 3. Git deposu başlatın:
```bash
git init
```

### 4. Tüm dosyaları ekleyin:
```bash
git add .
```

### 5. İlk commit'i yapın:
```bash
git commit -m "İlk commit: OMR Form Uygulaması"
```

### 6. GitHub'daki repository'nizi bağlayın:
```bash
git remote add origin https://github.com/KULLANICI_ADINIZ/omr-form-app.git
```

**ÖNEMLİ:** Yukarıdaki komutta `KULLANICI_ADINIZ` yerine kendi GitHub kullanıcı adınızı yazın!

### 7. Projenizi yükleyin:
```bash
git branch -M main
git push -u origin main
```

## İlk kez yükleme yapıyorsanız:

GitHub sizden kullanıcı adı ve şifre isteyecek. Ancak artık şifre yerine **Personal Access Token** kullanmanız gerekiyor.

### Personal Access Token Oluşturma:

1. GitHub'da sağ üst profil fotoğrafınıza tıklayın
2. Settings → Developer settings → Personal access tokens → Tokens (classic)
3. "Generate new token" butonuna tıklayın
4. Token'a bir isim verin (örn: "OMR Project")
5. "repo" kutucuğunu işaretleyin
6. "Generate token" butonuna tıklayın
7. Oluşan token'ı kopyalayın (tekrar göremezsiniz!)
8. Terminal'de şifre yerine bu token'ı kullanın

## Güncellemeleri yüklemek için:

Projenizde değişiklik yaptığınızda:

```bash
git add .
git commit -m "Açıklama mesajınız"
git push
```

## Projenizi çekmek için (başka bilgisayarda):

```bash
git clone https://github.com/KULLANICI_ADINIZ/omr-form-app.git
cd omr-form-app
npm install
npm start
```

## Yardım:

- Projenizin durumunu kontrol etmek: `git status`
- Commit geçmişini görmek: `git log`
- Değişiklikleri görmek: `git diff`

---

## Netlify/Vercel ile Yayınlama (GitHub'a yükledikten sonra):

### Netlify:
1. netlify.com → Sign up with GitHub
2. "New site from Git" → GitHub
3. Repository'nizi seçin
4. Build command: `npm run build`
5. Publish directory: `build`
6. Deploy!

### Vercel:
1. vercel.com → Sign up with GitHub
2. "Import Project" → GitHub
3. Repository'nizi seçin
4. Otomatik ayarları kabul edin
5. Deploy!

Her iki platform da ücretsiz ve otomatik HTTPS sağlar.
