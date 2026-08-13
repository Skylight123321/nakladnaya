JAAN PRINT v7 — GitHub Pages → iPhone → Pantum BP2300 USB
===========================================================

ГЛАВНОЕ
-------
• Кнопка принтера в приложении «Накладная» отправляет накладную на ПК.
• Pantum BP2300 печатает её автоматически через USB.
• Макет занимает только ВЕРХНЮЮ ПОЛОВИНУ листа A4 (формат примерно A5 landscape).
• На середине листа печатаются две маленькие метки по краям — по ним удобно разрезать A4 пополам.
• Нижняя половина остаётся чистой и может использоваться повторно.

ЧТО ОБНОВИТЬ НА GITHUB PAGES
----------------------------
Загрузите/замените 4 файла из папки pwa:
  index.html
  manifest.webmanifest
  sw.js
  icon.svg

После обновления GitHub Pages полностью закройте PWA «Накладная» на iPhone и откройте заново.
Если осталась старая версия из кэша — удалите ярлык с домашнего экрана и снова добавьте сайт через Safari.

ЧТО ЗАПУСКАТЬ НА WINDOWS
------------------------
Откройте папку windows и запустите START_SERVER_SAFE.bat.
Окно должно оставаться открытым во время печати.

При первом нажатии значка принтера приложение попросит адрес сервера.
Для текущей сети это: http://192.168.31.137:8765
Если IP компьютера позже изменится, введите новый адрес из окна сервера.

ВАЖНО ПРО FIREWALL
-------------------
На этом компьютере ранее были два блокирующих правила python.exe. Они уже были отключены вручную.
Firewall Windows оставляйте ВКЛЮЧЁННЫМ.

ПЕЧАТЬ
------
1. Заполните имя, товары, количество и цены.
2. Нажмите значок принтера сверху.
3. Safari откроет локальную страницу сервера, сервер сразу отправит накладную на Pantum.
4. Разрежьте A4 пополам по двум меткам на краях.

Если в накладной слишком много строк и она не помещается в половину A4, сервер автоматически напечатает продолжение на следующем листе A4, снова только в верхней половине.

V8 STABILITY UPDATE
-------------------
Use windows\START_SERVER_SAFE.bat.
The launcher automatically restarts Python if the process unexpectedly exits.
The Python server also catches handler errors and keeps serving other requests.
Diagnostic log: Documents\Jaan Print\logs\server.log
If printing stops, first open /health. If unavailable, the watchdog should restart the server within about 3 seconds.


V9: AUTOMATIC ADDRESS
=====================
The server advertises itself on the local network as:
  http://jaan-print.local:8765

iPhone and PC may move to another Wi-Fi network. As long as BOTH devices are
connected to the same LAN and local-device communication is allowed, the app
does not need the PC's numeric IP address.

Windows Firewall must allow:
  TCP 8765 inbound
  UDP 5353 inbound/outbound (mDNS)

One-time admin CMD commands:
  netsh advfirewall firewall add rule name="JAAN Print TCP 8765" dir=in action=allow protocol=TCP localport=8765 profile=any enable=yes
  netsh advfirewall firewall add rule name="JAAN Print mDNS 5353 IN" dir=in action=allow protocol=UDP localport=5353 profile=any enable=yes
  netsh advfirewall firewall add rule name="JAAN Print mDNS 5353 OUT" dir=out action=allow protocol=UDP localport=5353 profile=any enable=yes

Test from iPhone Safari:
  http://jaan-print.local:8765/health


V10 PRINT OPTIONS
==================
- Tapping Print opens a dialog: A5 or A4.
- The same dialog allows changing the local print-server URL/IP.
- Printing no longer automatically saves the invoice into history.
- A5 keeps the compact half-A4 layout; A4 uses the full A4 printable area.
