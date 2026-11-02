# Uyumlu görseller

**Orijinal Kaynak:** [https://web.dev/learn/design/responsive-images?hl=tr](https://web.dev/learn/design/responsive-images?hl=tr)

---

Web'deki metin, taşmaması için ekranın kenarında otomatik olarak kaydırılır. Resimlerin ise doğal bir boyutu vardır. Ekrandan daha geniş olan resimler taşar ve kullanıcının tamamını görebilmek için yatay olarak kaydırması gerekir.

Neyse ki CSS, bu durumun yaşanmasını önlemek için kullanabileceğiniz araçlar sunar.

## Resimlerinizi sınırlama

Stil sayfanızda, resimlerin hiçbir zaman kapsayan öğeden daha geniş bir boyutta oluşturulamayacağını belirtmek için [`max-inline-size`](https://developer.mozilla.org/docs/Web/CSS/max-inline-size) kullanabilirsiniz.

Browser Support

- ![Chrome: 57.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  57
- ![Edge: 79.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  79
- ![Firefox: 41.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  41
- ![Safari: 12.1.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  12.1

[Source](https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/max-inline-size)

```
img {
  max-inline-size: 100%;
  block-size: auto;
}
```

**Not:** İsterseniz `max-inline-size` yerine `max-width` kullanabilirsiniz ancak [mantıksal özellikler](https://web.dev/learn/design/internationalization?hl=tr#logical_properties) açısından düşünme alışkanlığı kazanmanızı öneririz.

Aynı kuralı, videolar ve iFrame'ler gibi diğer yerleştirilmiş içerik türlerine de uygulayabilirsiniz.

```
img,
video,
iframe {
  max-inline-size: 100%;
  block-size: auto;
}
```

Bu kural uygulandığında tarayıcılar, resimleri ekrana sığacak şekilde otomatik olarak küçültür.

![İki ekran görüntüsü: Birincisinde, tarayıcı genişliğini aşan bir resim gösteriliyor. İkincisinde ise aynı resmin tarayıcı görüntü alanıyla sınırlandırıldığı gösteriliyor.](https://web.dev/static/learn/design/responsive-images/image/two-screenshots-first-s-fbd980b13ed58.png?hl=tr)

Resminizi sınırladığınızda kullanıcılar, ekranı kaydırmadan resmin tamamını görebilir.

[`block-size`](https://developer.mozilla.org/docs/Web/CSS/block-size)
değerini `auto` olarak ayarladığınızda tarayıcı, resimlerinizi yeniden boyutlandırırken en boy oranını korur.

Bazen bir resmin boyutları içerik yönetim sistemi (İYS) veya başka bir içerik yayınlama sistemi tarafından ayarlanır. Tasarımınızda İYS'nin varsayılanından farklı bir en-boy oranı kullanılıyorsa sitenizin tasarımını korumak için [`aspect-ratio`](https://developer.mozilla.org/docs/Web/CSS/aspect-ratio) özelliğini kullanabilirsiniz:

```
img {
  max-inline-size: 100%;
  block-size: auto;
  aspect-ratio: 2/1;
}
```

Maalesef bu durum genellikle tarayıcının, resmi amaçlanan alana sığdırmak için sıkıştırması veya genişletmesi gerektiği anlamına gelir.

![Ağzında top olan, mutlu görünen yakışıklı bir köpeğin profil resmi. Ancak resim sıkıştırılmış.](https://web.dev/static/learn/design/responsive-images/image/profile-a-happy-looking-6886fa1061908.jpg?hl=tr)

Resmin en-boy oranının değiştirilmesi, resmin
sıkıştırılmış veya uzatılmış görünmesine neden olur.

Sıkıştırmayı ve uzatmayı önlemek için [`object-fit`](https://developer.mozilla.org/docs/Web/CSS/object-fit) özelliğini kullanın.

Browser Support

- ![Chrome: 32.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  32
- ![Edge: 79.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  79
- ![Firefox: 36.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  36
- ![Safari: 10.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  10

[Source](https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/object-fit)

`object-fit` değeri `contain` olduğunda tarayıcıya, gerekirse resmin etrafında boş alan bırakarak resmin en boy oranını koruması söylenir.

```
img {
  max-inline-size: 100%;
  block-size: auto;
  aspect-ratio: 2/1;
  object-fit: contain;
}
```

`object-fit` değeri `cover` olan bir resim, tarayıcıya resmin en boy oranını korumasını ve gerekirse resmi kırpmasını söyler.

```
img {
  max-inline-size: 100%;
  block-size: auto;
  aspect-ratio: 2/1;
  object-fit: cover;
}
```

![Ağzında top olan, mutlu görünen yakışıklı bir köpeğin profili. Resmin her iki tarafında da boş alan var.](https://web.dev/static/learn/design/responsive-images/image/profile-a-happy-looking-19f229b25e797.jpg?hl=tr)
![Ağzında top olan, mutlu görünen yakışıklı bir köpeğin profili. Resmin üst ve alt kısımları kırpılmış.](https://web.dev/static/learn/design/responsive-images/image/profile-a-happy-looking-9a3c6aedc16d2.jpg?hl=tr)

`object-fit` için iki farklı değerin uygulandığı aynı resim. Birincisinde "contain" (içer) değeri, ikincisinde ise "cover" (kapla) değeri kullanılıyor.

Resim kırpma işleminin konumunu [object-position](https://developer.mozilla.org/docs/Web/CSS/object-position) özelliğini kullanarak değiştirebilirsiniz. Bu işlem, kırpma işleminin odağını ayarlar. Böylece resmin en önemli kısmının görünür kalmasını sağlayabilirsiniz.

Browser Support

- ![Chrome: 32.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='-10 -10 276 276'%3E%3ClinearGradient id='a' x1='145' x2='34' y1='253' y2='61' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%231e8e3e'/%3E%3Cstop offset='1' stop-color='%2334a853'/%3E%3C/linearGradient%3E%3ClinearGradient id='b' x1='111' x2='222' y1='254' y2='62' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fcc934'/%3E%3Cstop offset='1' stop-color='%23fbbc04'/%3E%3C/linearGradient%3E%3ClinearGradient id='c' x1='17' x2='239' y1='80' y2='80' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23d93025'/%3E%3Cstop offset='1' stop-color='%23ea4335'/%3E%3C/linearGradient%3E%3Ccircle cx='128' cy='128' r='64' fill='%23fff'/%3E%3Cpath fill='url(%23a)' d='M96 183a64 64 0 0 1-23-23L17 64a128 128 0 0 0 111 192l55-96a64 64 0 0 1-87 23Z'/%3E%3Cpath fill='url(%23b)' d='M192 128a64 64 0 0 1-9 32l-55 96A128 128 0 0 0 239 64H128a64 64 0 0 1 64 64Z'/%3E%3Ccircle cx='128' cy='128' r='52' fill='%231a73e8'/%3E%3Cpath fill='url(%23c)' d='M96 73a64 64 0 0 1 32-9h111a128 128 0 0 0-222 0l56 96a64 64 0 0 1 23-87Z'/%3E%3C/svg%3E)

  32
- ![Edge: 79.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='0 0 27600 27600'%3E%3ClinearGradient id='A' gradientUnits='userSpaceOnUse'/%3E%3ClinearGradient id='B' x1='6870' x2='24704' y1='18705' y2='18705' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%230c59a4'/%3E%3Cstop offset='1' stop-color='%23114a8b'/%3E%3C/linearGradient%3E%3ClinearGradient id='C' x1='16272' x2='5133' y1='10968' y2='23102' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%231b9de2'/%3E%3Cstop offset='.16' stop-color='%231595df'/%3E%3Cstop offset='.67' stop-color='%230680d7'/%3E%3Cstop offset='1' stop-color='%230078d4'/%3E%3C/linearGradient%3E%3CradialGradient id='D' cx='16720' cy='18747' r='9538' xlink:href='%23A'%3E%3Cstop offset='.72' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.53'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='E' cx='7130' cy='19866' r='14324' gradientTransform='matrix(.14843 -.98892 .79688 .1196 -8759 25542)' xlink:href='%23A'%3E%3Cstop offset='.76' stop-opacity='0'/%3E%3Cstop offset='.95' stop-opacity='.5'/%3E%3Cstop offset='1'/%3E%3C/radialGradient%3E%3CradialGradient id='F' cx='2523' cy='4680' r='20243' gradientTransform='matrix(-.03715 .99931 -2.12836 -.07913 13579 3530)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2335c1f1'/%3E%3Cstop offset='.11' stop-color='%2334c1ed'/%3E%3Cstop offset='.23' stop-color='%232fc2df'/%3E%3Cstop offset='.31' stop-color='%232bc3d2'/%3E%3Cstop offset='.67' stop-color='%2336c752'/%3E%3C/radialGradient%3E%3CradialGradient id='G' cx='24247' cy='7758' r='9734' gradientTransform='matrix(.28109 .95968 -.78353 .22949 24510 -16292)' xlink:href='%23A'%3E%3Cstop offset='0' stop-color='%2366eb6e'/%3E%3Cstop offset='1' stop-color='%2366eb6e' stop-opacity='0'/%3E%3C/radialGradient%3E%3Cpath id='H' d='M24105 20053a9345 9345 0 01-1053 472 10202 10202 0 01-3590 646c-4732 0-8855-3255-8855-7432 0-1175 680-2193 1643-2729-4280 180-5380 4640-5380 7253 0 7387 6810 8137 8276 8137 791 0 1984-230 2704-456l130-44a12834 12834 0 006660-5282c220-350-168-757-535-565z'/%3E%3Cpath id='I' d='M11571 25141a7913 7913 0 01-2273-2137 8145 8145 0 01-1514-4740 8093 8093 0 013093-6395 8082 8082 0 011373-859c312-148 846-414 1554-404a3236 3236 0 012569 1297 3184 3184 0 01636 1866c0-21 2446-7960-8005-7960-4390 0-8004 4166-8004 7820 0 2319 538 4170 1212 5604a12833 12833 0 007684 6757 12795 12795 0 003908 610c1414 0 2774-233 4045-656a7575 7575 0 01-6278-803z'/%3E%3Cpath id='J' d='M16231 15886c-80 105-330 250-330 566 0 260 170 512 472 723 1438 1003 4149 868 4156 868a5954 5954 0 003027-839 6147 6147 0 001133-850 6180 6180 0 001910-4437c26-2242-796-3732-1133-4392-2120-4141-6694-6525-11668-6525-7011 0-12703 5635-12798 12620 47-3654 3679-6605 7996-6605 350 0 2346 34 4200 1007 1634 858 2490 1894 3086 2921 618 1067 728 2415 728 2952s-271 1333-780 1990z'/%3E%3Cuse fill='url(%23B)' xlink:href='%23H'/%3E%3Cuse fill='url(%23D)' opacity='.35' xlink:href='%23H'/%3E%3Cuse fill='url(%23C)' xlink:href='%23I'/%3E%3Cuse fill='url(%23E)' opacity='.4' xlink:href='%23I'/%3E%3Cuse fill='url(%23F)' xlink:href='%23J'/%3E%3Cuse fill='url(%23G)' xlink:href='%23J'/%3E%3C/svg%3E)

  79
- ![Firefox: 36.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 512 512'%3E%3Cdefs%3E%3CradialGradient id='ff-b' cx='428.5' cy='55.1' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23ffbd4f'/%3E%3Cstop offset='.2' stop-color='%23ffac31'/%3E%3Cstop offset='.3' stop-color='%23ff9d17'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff563b'/%3E%3Cstop offset='.5' stop-color='%23ff3750'/%3E%3Cstop offset='.7' stop-color='%23f5156c'/%3E%3Cstop offset='.8' stop-color='%23eb0878'/%3E%3Cstop offset='.9' stop-color='%23e50080'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-c' cx='245.4' cy='259.9' r='501' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%23960e18'/%3E%3Cstop offset='.3' stop-color='%23b11927' stop-opacity='.7'/%3E%3Cstop offset='.4' stop-color='%23db293d' stop-opacity='.3'/%3E%3Cstop offset='.5' stop-color='%23f5334b' stop-opacity='.1'/%3E%3Cstop offset='.5' stop-color='%23ff3750' stop-opacity='0'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-d' cx='305.8' cy='-58.6' r='363' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.3' stop-color='%23ffdc3e'/%3E%3Cstop offset='.5' stop-color='%23ff9d12'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-e' cx='190' cy='390.8' r='238.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.3' stop-color='%233a8ee6'/%3E%3Cstop offset='.5' stop-color='%235c79f0'/%3E%3Cstop offset='.7' stop-color='%239059ff'/%3E%3Cstop offset='1' stop-color='%23c139e6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-f' cx='252.2' cy='201.3' r='126.5' gradientTransform='matrix(1 0 0 1 -48 31)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%239059ff' stop-opacity='0'/%3E%3Cstop offset='.3' stop-color='%238c4ff3' stop-opacity='.1'/%3E%3Cstop offset='.8' stop-color='%237716a8' stop-opacity='.5'/%3E%3Cstop offset='1' stop-color='%236e008b' stop-opacity='.6'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-g' cx='239.1' cy='34.6' r='171.6' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe226'/%3E%3Cstop offset='.1' stop-color='%23ffdb27'/%3E%3Cstop offset='.3' stop-color='%23ffc82a'/%3E%3Cstop offset='.5' stop-color='%23ffa930'/%3E%3Cstop offset='.7' stop-color='%23ff7e37'/%3E%3Cstop offset='.8' stop-color='%23ff7139'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-h' cx='374' cy='-74.3' r='732.2' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-i' cx='304.6' cy='7.1' r='536.4' gradientTransform='rotate(84 303 4)' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.3' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.6' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-j' cx='235' cy='98.1' r='457.1' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.5' stop-color='%23ff980e'/%3E%3Cstop offset='.6' stop-color='%23ff5634'/%3E%3Cstop offset='.7' stop-color='%23ff3647'/%3E%3Cstop offset='.9' stop-color='%23e31587'/%3E%3C/radialGradient%3E%3CradialGradient id='ff-k' cx='355.7' cy='124.9' r='500.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.2' stop-color='%23ffe141'/%3E%3Cstop offset='.5' stop-color='%23ffaf1e'/%3E%3Cstop offset='.6' stop-color='%23ff980e'/%3E%3C/radialGradient%3E%3ClinearGradient id='ff-a' x1='446.9' y1='76.8' x2='47.9' y2='461.8' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.1' stop-color='%23fff44f'/%3E%3Cstop offset='.1' stop-color='%23ffe847'/%3E%3Cstop offset='.2' stop-color='%23ffc830'/%3E%3Cstop offset='.4' stop-color='%23ff980e'/%3E%3Cstop offset='.4' stop-color='%23ff8b16'/%3E%3Cstop offset='.5' stop-color='%23ff672a'/%3E%3Cstop offset='.5' stop-color='%23ff3647'/%3E%3Cstop offset='.7' stop-color='%23e31587'/%3E%3C/linearGradient%3E%3ClinearGradient id='ff-l' x1='442.1' y1='74.8' x2='102.6' y2='414.3' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='.2' stop-color='%23fff44f' stop-opacity='.8'/%3E%3Cstop offset='.3' stop-color='%23fff44f' stop-opacity='.6'/%3E%3Cstop offset='.5' stop-color='%23fff44f' stop-opacity='.2'/%3E%3Cstop offset='.6' stop-color='%23fff44f' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134a120 120 0 0 0-66 25 71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a229 229 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zM202 355l3 1-3-1zm55-145zm198-31z' fill='url(%23ff-a)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-b)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60 14 26 22 53 25 72v1a207 207 0 0 1-206 279c-113-3-212-87-231-197-3-17 0-26 2-40-2 11-3 14-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121z' fill='url(%23ff-c)'/%3E%3Cpath d='m362 195 1 1a130 130 0 0 0-22-29C266 92 322 5 331 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62z' fill='url(%23ff-d)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-e)'/%3E%3Cpath d='M257 210c-1 6-22 26-29 26-68 0-80 41-80 41 3 35 28 64 57 79l4 2 7 3a107 107 0 0 0 31 6c120 6 143-143 57-186 22-4 45 5 58 14-21-37-60-62-105-62l-9 1a120 120 0 0 0-66 25l17 16c16 16 58 33 58 35z' fill='url(%23ff-f)'/%3E%3Cpath d='m171 151 5 3a111 111 0 0 1-1-58c-25 11-44 29-58 44 1 0 36 0 54 11z' fill='url(%23ff-g)'/%3E%3Cpath d='M18 261a242 242 0 0 0 231 197 207 207 0 0 0 206-279c8 56-20 110-64 146-86 71-169 43-186 31l-3-1c-50-24-71-70-67-110-42 0-57-35-57-35s38-28 89-4c46 22 90 4 90 4 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5l-5-3c-18-11-52-11-54-11-9-12-9-51-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73c0 1-9 38-5 57z' fill='url(%23ff-h)'/%3E%3Cpath d='M341 167a130 130 0 0 1 22 29 46 46 0 0 1 4 3c55 50 26 121 24 126 44-36 72-90 64-146-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-9 5-65 92 10 167z' fill='url(%23ff-i)'/%3E%3Cpath d='M367 199a46 46 0 0 0-4-3l-1-1c-13-9-36-18-58-15 86 44 63 193-57 187a107 107 0 0 1-31-6 131 131 0 0 1-11-5c17 12 99 39 186-31 2-5 31-76-24-126z' fill='url(%23ff-j)'/%3E%3Cpath d='M148 277s12-41 80-41c7 0 28-20 29-26s-44 18-90-4c-51-24-89 4-89 4s15 35 57 35c-4 40 16 85 67 110l3 1c-29-15-54-44-57-79z' fill='url(%23ff-k)'/%3E%3Cpath d='M479 166c-11-25-32-52-49-60a249 249 0 0 1 25 73c-27-68-73-95-111-155a255 255 0 0 1-8-14 44 44 0 0 1-4-9 1 1 0 0 0 0-1 1 1 0 0 0-1 0c-60 35-81 101-83 134l9-1c45 0 84 25 105 62-13-9-36-18-58-14 86 43 63 192-57 186a107 107 0 0 1-31-6 131 131 0 0 1-11-5l-3-1 3 1c-29-15-54-44-57-79 0 0 12-41 80-41 7 0 28-20 29-26 0-2-42-19-58-35l-17-16a71 71 0 0 0-6-5 111 111 0 0 1-1-58c-25 11-44 29-58 44-9-12-9-52-8-60l-8 4a175 175 0 0 0-24 21 210 210 0 0 0-22 26 203 203 0 0 0-32 73l-1 2-2 15a279 279 0 0 0-4 34v1a240 240 0 0 0 477 40l1-9c5-41 0-84-15-121zm-24 13z' fill='url(%23ff-l)'/%3E%3C/svg%3E)

  36
- ![Safari: 10.](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='24' height='24' viewBox='195 190 135 135'%3E%3Cdefs%3E%3ClinearGradient id='s-a' x1='132.6' x2='134.4' y1='111.7' y2='-105.3' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23d2d2d2' /%3E%3Cstop offset='.5' stop-color='%23f2f2f2' /%3E%3Cstop offset='1' stop-color='%23fff' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-b' gradientUnits='userSpaceOnUse' /%3E%3ClinearGradient id='s-c' x1='65.4' x2='67.4' y1='115.7' y2='17.1' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23005ad5' /%3E%3Cstop offset='.2' stop-color='%230875f0' /%3E%3Cstop offset='.3' stop-color='%23218cee' /%3E%3Cstop offset='.6' stop-color='%2327a5f3' /%3E%3Cstop offset='.8' stop-color='%2325aaf2' /%3E%3Cstop offset='1' stop-color='%2321aaef' /%3E%3C/linearGradient%3E%3ClinearGradient id='s-d' x1='158.7' x2='176.3' y1='96.7' y2='79.5' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%23c72e24' /%3E%3Cstop offset='1' stop-color='%23fd3b2f' /%3E%3C/linearGradient%3E%3CradialGradient id='s-i' cx='-69.9' cy='69.3' r='54' gradientTransform='matrix(.9 -.01 .04 2.72 -9 -120)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-color='%2324a5f3' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%231e8ceb' /%3E%3C/radialGradient%3E%3CradialGradient id='s-j' cx='109.3' cy='13.8' r='93.1' gradientTransform='matrix(-.02 1.1 -1.04 -.02 137 -115)' xlink:href='%23s-b'%3E%3Cstop offset='0' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235488d6' stop-opacity='0' /%3E%3Cstop offset='1' stop-color='%235d96eb' /%3E%3C/radialGradient%3E%3C/defs%3E%3Crect width='220' height='220' x='22' y='-107' fill='url(%23s-a)' ry='49' transform='matrix(.57 0 0 .57 187 256)' /%3E%3Cg transform='translate(194 190)'%3E%3Ccircle cx='67.8' cy='67.7' fill='url(%23s-c)' paint-order='stroke fill markers' r='54' /%3E%3Ccircle cx='-69.9' cy='69.3' fill='url(%23s-i)' transform='translate(138 -2)' r='54' /%3E%3C/g%3E%3Cellipse cx='120' cy='14.2' fill='url(%23s-j)' rx='93.1' ry='93.7' transform='matrix(.58 0 0 .58 192 250)' /%3E%3Cg transform='matrix(.58 0 0 .57 197 182)'%3E%3Cpath fill='%23cac7c8' d='M46 192h1l72-48-7-9-66 57Z' /%3E%3Cpath fill='%23fbfffc' d='M46 191v1l66-57-7-9-59 65Z' /%3E%3Cpath fill='url(%23s-d)' d='m119 144-7-9 66-57-59 66Z' /%3E%3Cpath fill='%23fb645c' d='m105 126 7 9 66-57-1-1-72 49Z' /%3E%3C/g%3E%3Cpath stroke='%23fff' stroke-linecap='round' stroke-miterlimit='1' stroke-width='1.3' d='m287 278 3-2m-12-17 8-2m-8-3h4m-4-13 8 2m-8 3h4m-1-13 7 3m-4-11 7 4m-2-11 6 6m0-12 6 7m1-11 4 6m4-10 3 7m5-9 2 7m15-7-1 7m10-5-3 7m11-4-4 7m11-2-5 6m16 7-7 4m10 4-7 3m10 6-8 1m8 16-8-2m5 10-7-3m4 11-7-4m2 11-6-5m0 11-5-6m-2 11-4-7m-4 11-3-8m-6 10-1-8m-16 8 2-8m-10 5 3-7m-11 4 4-7m-11 2 5-6m-8 3 3-3m4 8 2-3m5 8 2-4m6 7 1-4m8 5v-4m8 4v-4m9 3-1-4m9 1-2-4m9 0-2-4m9-2-3-3m8-4-3-2m8-5-4-2m7-6-4-1m5-8h-4m4-8h-4m3-9-4 1m1-9-4 2m-1-9-3 2m-2-9-3 3m-4-8-2 3m-5-8-2 4m-6-6-1 3m-8-5v4m-8-4v4m-9-2 1 3m-9 0 2 3m-9 1 2 3m-9 2 3 3m-8 4 3 2m-8 5 4 2m-7 6 4 1m-4 25 4-1m-2 5 7-3m-6 7 4-2m-2 6 7-4m-13-21h8m41-41v-8m0 99v-8m49-42h-8' transform='translate(-65 8)' /%3E%3C/svg%3E)

  10

[Source](https://developer.mozilla.org/docs/Web/CSS/Reference/Properties/object-position)

```
img {
  max-inline-size: 100%;
  block-size: auto;
  aspect-ratio: 2/1;
  object-fit: cover;
  object-position: top center;
}
```

![Ağzında top olan, mutlu ve yakışıklı bir köpeğin profili. Resim yalnızca alt kısımdan kırpılmış.](https://web.dev/static/learn/design/responsive-images/image/profile-a-happy-looking-a9de08840e85f.jpg?hl=tr)

`object-position` seçeneğini kullanarak resminizin yalnızca bir tarafını kırpabilirsiniz.

## Resimlerinizi yayınlama

Bu CSS kuralları, tarayıcıya resimlerin nasıl oluşturulmasını istediğinizi bildirir. Tarayıcının bu resimleri nasıl işleyeceğiyle ilgili olarak HTML'nizde ipuçları da verebilirsiniz.

### Boyutlandırma ipuçları

Resminizin boyutlarını biliyorsanız her zaman `width` ve `height` özelliklerini ekleyin. Resim, `max-inline-size` kuralınız nedeniyle farklı bir boyutta oluşturulsa bile tarayıcı, genişlik-yükseklik oranını bilir ve doğru miktarda alan ayırabilir. Bu sayede, resim yüklendiğinde diğer içeriklerinizin yer değiştirmesi önlenir.

```
<img
 src="image.png"
 alt="A description of the image."
 width="300"
 height="200"
>
```

[  ](https://web.dev/static/learn/design/responsive-images/video/tcFciHGuF3MxnTr1y5ue01OGLBn2/WOQn6K6OQcoElRw0NCkZ.mp4?hl=tr)
[  ](https://web.dev/static/learn/design/responsive-images/video/tcFciHGuF3MxnTr1y5ue01OGLBn2/sFxDb36aEMvTPIyZHz1O.mp4?hl=tr)

İlk videoda, tanımlanmış resim boyutları olmayan bir düzen gösteriliyor. Resimler yüklendiğinde metnin nasıl atladığına dikkat edin. İkinci videoda resim boyutları belirtildiği için tarayıcı, resim için yer bırakır ve resim yüklendiğinde metin yer değiştirmez.

### Yüklemeyle ilgili ipuçları

Tarayıcıya, resmin yüklenmesini görünüm alanına girene veya görünüm alanına yaklaşana kadar erteleyip ertelemeyeceğini bildirmek için `loading` özelliğini kullanın. Katlanma çizgisinin altındaki resimler için `lazy` değerini kullanın. Tarayıcı, kullanıcı yeterince aşağı kaydırıp resim görünmek üzere olana kadar geç yüklenen resimleri yüklemez. Kullanıcı hiç kaydırmazsa resim yüklenmez.

```
<img
 src="image.png"
 alt="A description of the image."
 width="300"
 height="200"
 loading="lazy"
>
```

[  ](https://web.dev/static/learn/design/responsive-images/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/jazsyaOjXfHS0g8yUijR.mp4?hl=tr)

Geç yüklenen resimler, kullanıcı kaydırarak bu resimlere ulaşana kadar yüklenmeyi bekler.

Sayfanın üst kısmında yer alan bir banner resminde `loading` kullanmayın. Siteniz `loading="lazy"` özelliğini otomatik olarak uyguluyorsa resimlerin geç yüklenmesini önlemek için genellikle `loading` özelliğini `eager` varsayılan değerine ayarlayabilirsiniz:

```
<img
 src="hero.jpg"
 alt="A description of the image."
 width="1200"
 height="800"
 loading="eager"
>
```

### Getirme Önceliği

[LCP](https://web.dev/articles/lcp?hl=tr) resmi gibi önemli resimler için `fetchpriority` özelliğini `high` olarak ayarlayarak [Fetch Priority](https://web.dev/articles/fetch-priority?hl=tr) ile yüklemeye daha fazla öncelik verebilirsiniz:

```
<img
 src="hero.jpg"
 alt="A description of the image."
 width="1200"
 height="800"
 loading="eager"
 fetchpriority="high"
>
```

Bu, tarayıcıya düzenini tamamlayıp resimleri normal şekilde getirmesini beklemek yerine resmi hemen ve yüksek öncelikli olarak getirmesini söyler.

Ancak tarayıcıdan bir kaynağın (ör. resim) indirilmesine öncelik vermesini istediğinizde tarayıcı, başka bir kaynağın (ör. komut dosyası veya yazı tipi dosyası) önceliğini düşürmek zorundadır. `fetchpriority="high"` değerini yalnızca gerçekten önemliyse bir resme ayarlayın.

### Önceden yüklemeyle ilgili ipuçları

Mümkün olduğunda tüm resimleri ilk HTML dosyasına ekleyerek önceden yüklemeyi önlemek en iyisidir. Ancak JavaScript veya CSS [arka plan resmi](#background-images) ile eklenen resimler gibi bazı resimler kullanılamayabilir.

Tarayıcının bu önemli resimleri önceden getirmesini sağlamak için önceden yükleme özelliğini kullanabilirsiniz. Gerçekten önemli resimler için bu önceden yükleme işlemini `fetchpriority` özelliğiyle birleştirebilirsiniz:

```
<link rel="preload" href="hero.jpg" as="image" fetchpriority="high">
```

Tarayıcının önceliklendirme sezgisel yöntemlerini çok sık geçersiz kılmamak için bu özellikleri yine dikkatli bir şekilde kullanın. Bunları aşırı kullanmak performansın düşmesine neden olabilir.

Bazı tarayıcılar, `imagesrcset` ve `imagesizes` özelliklerini kullanarak [srcset](#srcset)'e göre [duyarlı resimlerin önceden yüklenmesini](https://web.dev/articles/preload-responsive-images?hl=tr) destekler.
Örneğin:

```
<link rel="preload" imagesrcset="hero_sm.jpg 1x hero_med.jpg 2x hero_lg.jpg 3x" as="image" fetchpriority="high">
```

`href` geri dönüşünü hariç tutarak `srcset` desteği olmayan tarayıcıların doğru resmi önceden yüklemesini sağlayabilirsiniz.

Belirli biçimlerin tarayıcı desteğine bağlı olarak farklı biçimlerdeki resimleri önceden yükleyemezsiniz. Bunu yapmaya çalışmak, kullanıcıların verilerini boşa harcayan ek indirmelere neden olabilir.

## `srcset` ile duyarlı resimler

Bu `max-inline-size: 100%` bildirimi sayesinde resimleriniz kapsayıcılarının dışına çıkamaz. Ancak küçük ekranı ve düşük bant genişliğine sahip bir ağı olan kullanıcıların, daha büyük ekranlı kullanıcılarla aynı boyuttaki resimleri indirmesi veri israfına yol açar.

Bu sorunu düzeltmek için aynı resmin farklı boyutlardaki birden fazla sürümünü ekleyin ve bu boyutların var olduğunu ve ne zaman kullanılacağını tarayıcıya bildirmek için [`srcset`](https://developer.mozilla.org/docs/Web/HTML/Element/img#attr-srcset) özelliğini kullanın.

### Genişlik tanımlayıcısı

Virgülle ayrılmış liste kullanarak `srcset` tanımlayabilirsiniz. Her değer, bir resmin URL'si, ardından bir boşluk ve ardından resimle ilgili bazı meta verilerdir. Bu meta verilere *açıklama* adı verilir.

Bu örnekte, meta veriler `w` birimi kullanılarak her resmin genişliğini tanımlamaktadır. Bir `w`, bir pikselin genişliğidir.

```
<img
 src="small-image.png"
 alt="A description of the image."
 width="300"
 height="200"
 loading="lazy"
 decoding="async"
 srcset="small-image.png 300w,
  medium-image.png 600w,
  large-image.png 1200w"
>
```

`srcset` özelliği, `src` özelliğinin yerini almak yerine onu tamamlar.
Geçerli bir `src` özelliğinizin olması gerekir ancak tarayıcı, değerini `srcset` içinde listelenen seçeneklerden biriyle değiştirebilir. Bant genişliğinden tasarruf etmek için tarayıcı yalnızca gerekirse daha büyük resmi indirir.

### Boyutlar

Genişlik tanımlayıcısını kullanıyorsanız tarayıcıya daha fazla bilgi vermek için [`sizes`](https://developer.mozilla.org/docs/Web/HTML/Element/img#attr-sizes) özelliğini de kullanmanız gerekir. Bu, tarayıcıya farklı koşullarda resmin hangi boyutta gösterilmesini beklediğinizi bildirir. Bu koşullar bir medya sorgusunda belirtilir.

`sizes` özelliği, virgülle ayrılmış bir medya sorguları ve resim genişlikleri listesi alır.

**Not:** CSS medya sorgularının bir HTML öğesinin içinde olması tuhaf bir durumdur. Sunum ve yapı ayrımını bozar. Ancak bu, gerekli boyutlandırma bilgilerini etkili olacak kadar hızlı bir şekilde sağlamanın tek yoludur.

```
<img
 src="small-image.png"
 alt="A description of the image."
 width="300"
 height="200"
 loading="lazy"
 decoding="async"
 srcset="small-image.png 300w,
  medium-image.png 600w,
  large-image.png 1200w"
 sizes="(min-width: 66em) 33vw,
  (min-width: 44em) 50vw,
  100vw"
>
```

Bu örnekte, tarayıcıya genişliği `66em` olan bir görünüm alanında resmin, ekranın üçte birinden daha geniş olmayacak şekilde gösterilmesi gerektiğini söylüyorsunuz (örneğin, üç sütunlu bir düzende).

Görüntü alanı genişliği `44em` ile `66em` arasında olduğunda resmi ekran genişliğinin yarısı kadar genişlikte gösterin (iki sütunlu düzende olduğu gibi).

`44em` değerinden daha dar olan her şey için resmi ekranın tam genişliğinde gösterin.

Bu nedenle, en büyük resim en geniş ekran için kullanılmayabilir. Çok sütunlu düzeni görüntüleyebilen geniş bir tarayıcı penceresinde, tek sütunlu düzende kullanılan ve daha dar bir ekranda tek sütunlu düzene sığan resimden daha küçük olabilecek bir resim kullanılır.

[  ](https://web.dev/static/learn/design/responsive-images/video/KT4TDYaWOHYfN59zz6Rc0X4k4MH3/MkUAq5XQyjlUXLvkT4jL.mp4?hl=tr)

Sayfanızın farklı ekran boyutlarında nasıl düzenleneceğini değiştirmek için boyut tanımlayıcılarını kullanın.

### Piksel yoğunluğu tanımlayıcısı

Ayrıca, yüksek yoğunluklu ekranlarda gösterilecek resimlerin alternatif bir sürümünü sağlamak için tanımlayıcıları kullanabilirsiniz. Böylece, resimler sağladıkları daha yüksek çözünürlüklerde net görünmeye devam eder.

![Ağzında top olan, mutlu görünen yakışıklı bir köpeğin aynı resminin iki versiyonu. Bir resim net, diğeri ise bulanık görünüyor.](https://web.dev/static/learn/design/responsive-images/image/two-versions-the-same-im-f13b154ee2cc8.png?hl=tr)

Piksel yoğunluğu düşük olan resimler bulanık görünebilir.

Yoğunluk tanımlayıcısı, resmin piksel yoğunluğunu `src` özelliğindeki resimle ilişkili olarak tanımlamak için kullanılır. Yoğunluk tanımlayıcısı, x harfiyle takip edilen bir sayıdır (ör. `1x` veya `2x`).

```
<img
 src="small-image.png"
 alt="A description of the image."
 width="300"
 height="200"
 loading="lazy"
 decoding="async"
 srcset="small-image.png 1x,
  medium-image.png 2x,
  large-image.png 3x"
>
```

`small-image.png` 300x200 piksel boyutunda ve `medium-image.png` 600x400 piksel boyutunda ise `srcset` listesinde `medium-image.png` öğesinden sonra `2x` öğesi yer alabilir.

Tam sayı kullanmanız gerekmez. Resmin başka bir sürümü 450x300 piksel boyutundaysa bunu `1.5x` ile açıklayabilirsiniz.

**Not:** Genişlik tanımlayıcıları *veya* yoğunluk tanımlayıcıları kullanabilirsiniz, ancak ikisini *birlikte* kullanamazsınız.

## Sunum amaçlı resimler

HTML'deki görseller içeriktir. Bu nedenle, ekran okuyucular ve arama motorları için resmin açıklamasını içeren `alt` özelliğini eklemeniz gerekir.

Anlamlı içerik içermeyen, yalnızca dekoratif amaçlı bir resim yerleştirirseniz boş bir `alt` özelliği kullanabilirsiniz.

```
<img
 src="flourish.png"
 alt=""
 width="400"
 height="50"
>
```

Boş olsa bile `alt` özelliğini her zaman eklemeniz gerekir.
Boş bir `alt` özelliği, ekran okuyucuya resmin sunum amaçlı olduğunu bildirir. Eksik bir `alt` özelliği bu bilgiyi sağlamaz.

İdeal olarak, sunum amaçlı veya dekoratif resimler HTML yerine CSS ile eklenir. HTML, yapı için kullanılır. CSS, sunum içindir.

**İpucu:** [Erişilebilir resimler](https://web.dev/learn/accessibility/images?hl=tr) oluşturmayı öğrenin.

## Arka plan resimleri

Sunum amaçlı resimleri yüklemek için CSS'deki `background-image` özelliğini kullanın.

```
element {
  background-image: url(flourish.png);
}
```

`background-image` için [`image-set`](https://developer.mozilla.org/docs/Web/CSS/image/image-set()) işlevini kullanarak birden fazla resim adayı belirtebilirsiniz.

CSS'deki `image-set` işlevi, HTML'deki `srcset` özelliğine benzer şekilde çalışır.
Her biri için piksel yoğunluğu tanımlayıcısı içeren bir resim listesi sağlayın.

```
element {
  background-image: image-set(
    small-image.png 1x,
    medium-image.png 2x,
    large-image.png 3x
  );
}
```

Tarayıcı, cihazın piksel yoğunluğu için en uygun resmi seçer.

Sitenize resim eklerken dikkate almanız gereken birçok faktör vardır. Bunlardan bazıları:

- Her resim için doğru alanı ayırma
- Kaç boyuta ihtiyacınız olduğunu belirleme
- Resmin içerik mi yoksa dekoratif mi olduğuna karar verme

Resimlerinizi doğru şekilde ayarlamak için zaman ayırmanız önemlidir. Kötü görüntü stratejileri, kullanıcılarınızı rahatsız edip hayal kırıklığına uğratabilir. İyi bir resim stratejisi, kullanıcının cihazından veya ağ bağlantısından bağımsız olarak sitenizin hızlı ve net görünmesini sağlar.

Resimleriniz üzerinde daha fazla kontrol sahibi olmanızı sağlayacak bir HTML öğesi daha vardır: [`picture` öğesi](https://web.dev/learn/design/picture-element?hl=tr).

### Bilgilerinizi sınayın

Resimlerle ilgili bilginizi test edin.

> [Öğrendiklerinizi Test Edin]
> Resimlerin görünüm alanına sığması için stiller eklenmelidir.
> Doğru
> Kapsama alanı olmayan resimler, doğal boyutlarında olur.
> Yanlış
> Stiller zorunludur.
> Bir resmin yüksekliği ve genişliği doğal olmayan bir en boy oranına zorlandığında, hangi stiller resmin bu oranlara nasıl sığacağını ayarlamaya yardımcı olabilir?
> object-fit
> Resmin,
> contain
> ve
> cover
> gibi anahtar kelimelerle nasıl uyum sağladığını belirtin.
> image-fit
> Bu mülk mevcut değil, ben uydurdum.
> fit-image
> Bu mülk mevcut değil, ben uydurdum.
> aspect-ratio
> Bu işlem, doğal olmayan bir görüntü oranına neden olabilir veya bu oranı düzeltebilir.
> Resimlerinize
> height
> ve
> width
> eklediğinizde CSS, resimleri farklı şekilde stilize edemez.
> Doğru
> Bunları kurallardan ziyade ipuçları olarak düşünebilirsiniz.
> Yanlış
> CSS, yükseklik ve genişlik etikette satır içi olsa bile resimleri boyutlandırmak için çok sayıda dinamik seçeneğe sahiptir.
> srcset
> özelliği,
> src
> özelliğini \_\_\_\_\_\_\_ değil, \_\_\_\_\_\_\_ eder.
> tamamlayıcı, yerine geçen
> srcset
> ,
> src
> özelliğinin yerini kesinlikle almaz.
> replace, complements
> Tarayıcı destekliyorsa tarayıcının seçebileceği ek seçenekler sunar.
> Resimde
> alt
> olmaması, boş bir
> alt
> ile aynıdır.
> Doğru
> Boş bir
> alt
> özelliği, ekran okuyucuya bu resmin sunum amaçlı olduğunu bildirir.
> Yanlış
> Eksik
> alt
> , ekran okuyucuya hiçbir şey ifade etmez.
