# Music Space

## Chạy trên máy
1. Cài Node.js LTS.
2. Mở thư mục này bằng VS Code.
3. Chạy `npm install` rồi `npm run dev`.
4. Mở địa chỉ localhost mà Vite hiển thị.

## Cấu hình Firebase
Mở `src/firebase.js`, thay toàn bộ `YOUR_...` bằng cấu hình Web App trong Firebase Console > Project settings > Your apps.

Trong Firebase Console:
- Authentication > Sign-in method: bật **Email/Password** và **Google**.
- Authentication > Settings > Authorized domains: thêm domain đang chạy (ví dụ `localhost`) và domain website đã deploy.
- Tạo Firestore Database và bật Storage.
- Thiết lập Firestore Rules và Storage Rules phù hợp trước khi đưa website lên mạng.

## Music Search Bot
Bot tìm bài hát bằng iTunes Search API, trả về kết quả và phát thử preview khi nhà cung cấp có cung cấp preview. Preview thường chỉ là đoạn nghe thử, không phải bản nhạc đầy đủ.

## Lưu ý
- Đăng nhập Google yêu cầu bật Google provider trong Firebase Authentication.
- Tải file lên yêu cầu người dùng đã đăng nhập và Storage Rules cho phép thao tác.
- Link nhạc thêm bằng URL cần là đường dẫn trực tiếp tới file âm thanh.


## Nguồn nhạc được hỗ trợ

Bản này phát nhạc bằng thẻ audio HTML5 cho file âm thanh trực tiếp (MP3, WAV, OGG, M4A, AAC, FLAC). Không nhúng YouTube, Spotify hoặc SoundCloud và không đưa trình phát của các nền tảng ra ngoài màn hình. Link trang YouTube/Spotify/SoundCloud sẽ bị từ chối khi thêm URL. Music Search Bot chỉ phát preview nếu API trả về URL âm thanh preview.


## Giới hạn của bản tạm thời
- YouTube, SoundCloud và Spotify đang bị tắt; không có iframe/API của các nền tảng này.
- Thanh player điều khiển file âm thanh trực tiếp và preview do iTunes cung cấp.
- File tải lên dùng Firebase Storage, giới hạn 50 MB theo Storage Rules đi kèm.
- Trước khi chạy, bắt buộc thay cấu hình mẫu trong `src/firebase.js` bằng cấu hình Firebase Web App của dự án.
- Nếu Firebase Storage của dự án dùng bucket khác, giữ nguyên `storageBucket` đúng như Firebase Console cung cấp.
