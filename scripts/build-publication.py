"""Build a portable case site and PDF from the StoreAssist documents.

Install scripts/requirements-publication.txt, then run this file.
The output directory must not exist: this prevents deleting unrelated files.
"""
from pathlib import Path
import argparse
import html
import re
import shutil
import unicodedata
from urllib.parse import unquote, urlsplit, urlunsplit

import markdown
from PIL import Image
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import Paragraph

ROOT = Path(__file__).resolve().parents[1]
GREEN = '#253e32'
MUTED = '#627267'
CREAM = '#f7f7ef'
SAGE = '#e3eadc'
LINE = '#d3ddce'
DIAGRAMS = [
 ('01-bpmn-as-is', 'AS-IS: запрос товара со склада', 'Известные действия продавца и склада; без восстановления исторических статусов.'),
 ('02-bpmn-to-be', 'TO-BE: основной процесс', 'Поиск, результат и продолжение обслуживания; подробные ветки вынесены отдельно.'),
 ('03-bpmn-create-request', 'Создание запроса', 'Обновление наличия, актуальный ноль и подтверждение неизвестных сведений.'),
 ('04-bpmn-cancellation', 'Отмена и фактическая передача', 'Разрешение отмены с учётом того, что уже произошло на складе и в зале.'),
 ('05-bpmn-discrepancy', 'Проверка расхождения', 'Отдельное обращение старшему склада; наблюдение не меняет учёт автоматически.'),
 ('06-bpmn-search-handover', 'Передача поиска', 'Ответственность меняется только после принятия складским коллегой.'),
 ('07-bpmn-service-handover', 'Передача обслуживания', 'Смена продавца сохраняет складские назначения и историю запросов.'),
 ('08-request-states', 'Состояния запроса', 'Готовность и фактическая передача разделены; отмена в работе требует разрешения.'),
]

CSS = '''
:root{color-scheme:light;--ink:#253e32;--muted:#627267;--paper:#f7f7ef;--line:#d3ddce;--sage:#e3eadc;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:var(--paper);font-size:100%}
*{box-sizing:border-box}body{margin:0}a{color:inherit;text-underline-offset:.22em}a:hover{text-decoration-thickness:2px}button,a{touch-action:manipulation}a:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #466944;outline-offset:5px}img{max-width:100%;height:auto}svg{max-width:100%}h1,h2,h3{line-height:1.15;letter-spacing:-.035em;text-wrap:balance}h1{font-size:clamp(2.3rem,5.7vw,4.8rem);max-width:16ch;margin:.6em 0 .45em}h2{font-size:clamp(1.65rem,3vw,2.5rem)}h3{font-size:1.2rem}p,li{line-height:1.65}p{max-width:74ch}header,.wrap{width:min(1160px,calc(100% - 48px));margin:auto}header{display:flex;justify-content:space-between;align-items:center;gap:24px;min-height:88px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:9px;font-weight:750;text-decoration:none;font-size:1.1rem}.brand img{width:30px}.nav{display:flex;gap:24px;flex-wrap:wrap;font-size:.92rem}.nav a{text-decoration:none}.eyebrow{font-size:.75rem;text-transform:uppercase;letter-spacing:.16em;font-weight:650;color:var(--muted)}.hero{padding:78px 0 65px;display:grid;grid-template-columns:1.4fr 1fr;gap:54px;align-items:center}.lead{font-size:1.16rem;color:var(--muted);max-width:48ch}.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:46px;padding:12px 20px;border:1px solid var(--line);border-radius:12px;text-decoration:none;font-weight:600;background:#fff}.primary{background:var(--ink);color:#fff;border-color:var(--ink)}.button:active{filter:brightness(.94)}.flow{background:var(--sage);border-radius:24px;padding:28px}.flow ol{padding:0;list-style:none;margin:15px 0 0;counter-reset:step}.flow li{position:relative;padding:17px 0 17px 42px;border-bottom:1px solid #c8d3c3;counter-increment:step;line-height:1.4}.flow li:last-child{border:0}.flow li:before{content:'0' counter(step);position:absolute;left:0;top:18px;font-size:.75rem;color:var(--muted)}.flow strong,.flow span{display:block}.flow span{color:var(--muted);font-size:.9rem;margin-top:4px}.section{padding:55px 0;border-top:1px solid var(--line)}.intro{display:grid;grid-template-columns:1fr 1.55fr;gap:60px}.intro h2{margin-top:8px}.intro p:first-child{margin-top:0}.changes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 40px}.change{padding:28px 0;border-bottom:1px solid var(--line)}.change p{color:var(--muted);margin-bottom:0}.change .eyebrow{font-size:.72rem}.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}.metric{padding:24px 0;border-top:2px solid var(--ink)}.metric h3{margin:12px 0}.metric p{font-size:.95rem;color:var(--muted)}.note{background:var(--sage);padding:20px 24px;border-radius:14px;margin-top:28px}.diagram-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.diagram{display:block;text-decoration:none;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden}.diagram img{width:100%;height:210px;object-fit:contain;padding:14px;background:#fff}.diagram figcaption{padding:18px 22px;border-top:1px solid var(--line);line-height:1.5}.diagram figcaption span{display:block;color:var(--muted);font-size:.86rem;margin-top:7px}.diagram figure{margin:0}.gallery-tools{display:flex;gap:20px;margin-top:22px}.docs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}.docs ul{padding-left:19px}.docs li{margin:12px 0}.status{display:flex;gap:24px;flex-wrap:wrap}.status strong{font-size:1.7rem;display:block}.status div{padding:14px 22px 14px 0}.status small{color:var(--muted)}footer{padding:34px 0 50px;border-top:1px solid var(--line);font-size:.88rem;color:var(--muted)}.doc{max-width:960px;padding:38px 0 80px}.doc h1{font-size:clamp(2rem,4vw,3rem);max-width:none}.doc h2{font-size:1.65rem;margin-top:2em}.doc h3{margin-top:2em}.doc table{border-collapse:collapse;width:100%;font-size:.9rem}.doc td,.doc th{padding:12px;text-align:left;vertical-align:top;border:1px solid var(--line);overflow-wrap:anywhere}.doc th{background:var(--sage)}.table-scroll{overflow:auto;max-width:100%;margin:24px 0}.doc pre{overflow:auto;padding:20px;background:#e8eee3;border-radius:12px;max-width:100%}.doc blockquote{border-left:3px solid #a1b597;margin-left:0;padding-left:22px;color:var(--muted)}.doc img{background:#fff}.doc :target{scroll-margin-top:25px;background:#ecf0df}details{margin-top:25px}summary{cursor:pointer;min-height:44px;padding:12px 0}dialog{width:calc(100vw - 36px);height:calc(100dvh - 36px);max-width:none;max-height:none;border:1px solid var(--line);border-radius:16px;padding:0;background:var(--paper);color:var(--ink)}dialog::backdrop{background:rgb(18 33 25 / .7)}.dialog-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;border-bottom:1px solid var(--line)}.diagram-view{height:calc(100% - 77px);overflow:auto;background:#fff}.diagram-view img{display:block;max-width:none;width:var(--diagram-width);height:auto;margin:0}.close{min-width:44px;min-height:44px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);font-size:1.4rem}.dialog-actions{display:flex;align-items:center;gap:15px;flex-wrap:wrap}.dialog-actions a{font-size:.9rem}.diagram-help{font-size:.85rem;color:var(--muted);margin:18px 0}.skip{position:absolute;left:20px;top:-100px;background:#fff;padding:12px;z-index:5}.skip:focus{top:10px}@media(max-width:760px){header,.wrap{width:calc(100% - 32px)}header{align-items:flex-start;padding:22px 0;min-height:0;gap:16px;flex-direction:column}.nav{gap:18px}.hero{grid-template-columns:1fr;gap:32px;padding:42px 0}.intro,.changes,.metrics,.docs,.diagram-grid{grid-template-columns:1fr;gap:20px}.section{padding:34px 0}.intro{gap:12px}.diagram img{height:180px}.actions .button{flex:1 1 190px}.flow{padding:22px}.doc td,.doc th{min-width:135px}.doc table{min-width:650px}.dialog-bar{align-items:flex-start}.dialog-bar strong{font-size:.9rem}}@media(prefers-reduced-motion:no-preference){.button{transition:background-color .12s}}@media(forced-colors:active){.button,.diagram,.note,.flow{border:1px solid CanvasText}.primary{background:ButtonFace;color:ButtonText}}
'''

def shell(title, body, prefix='', doc=False):
    return f'''<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="StoreAssist: бизнес-анализ запроса товара со склада. Процесс, требования, диаграммы и интерактивный прототип."><title>{html.escape(title)} · StoreAssist</title><link rel="icon" href="{prefix}prototype/dist/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="{prefix}site.css"></head><body><a class="skip" href="#site-main">К содержимому</a><header><a class="brand" href="{prefix}index.html"><img src="{prefix}prototype/dist/logo.svg" alt="">StoreAssist</a><nav class="nav" aria-label="Навигация"><a href="{prefix}index.html#process">Процесс</a><a href="{prefix}index.html#diagrams">Диаграммы</a><a href="{prefix}index.html#documents">Документы</a><a href="{prefix}prototype/dist/index.html?v=design17">Прототип ↗</a></nav></header><main id="site-main" class="wrap{' doc' if doc else ''}">{body}</main><footer class="wrap">StoreAssist · Запрос товара со склада<br>Бизнес-анализ процесса. Прототип использует демонстрационные данные.</footer></body></html>'''

def slugify(value, separator):
    value=unicodedata.normalize('NFKC',value).lower()
    return re.sub(r'[-\s]+',separator,re.sub(r'[^\w\s-]','',value)).strip(separator)

def pdf_fonts():
    candidates = [Path('C:/Windows/Fonts'),Path('/usr/share/fonts/truetype/dejavu')]
    for folder in candidates:
        regular = folder / ('segoeui.ttf' if folder.name == 'Fonts' else 'DejaVuSans.ttf')
        bold = folder / ('segoeuib.ttf' if folder.name == 'Fonts' else 'DejaVuSans-Bold.ttf')
        if regular.exists() and bold.exists():
            pdfmetrics.registerFont(TTFont('Body',str(regular)))
            pdfmetrics.registerFont(TTFont('Bold',str(bold)))
            pdfmetrics.registerFontFamily('Body',normal='Body',bold='Bold',italic='Body',boldItalic='Bold')
            return
    raise RuntimeError('Install DejaVu Sans or provide Segoe UI fonts')

def build_pdf(output):
    pdf_fonts()
    output.parent.mkdir(parents=True,exist_ok=True)
    c=Canvas(str(output),pagesize=(595,842),pageCompression=1)
    c.setTitle('StoreAssist - запрос товара со склада')
    c.setAuthor('StoreAssist')
    c.setSubject('Контекст, решения, метрики и восемь готовых диаграмм')
    style=ParagraphStyle('body',fontName='Body',fontSize=10.5,leading=16,textColor=HexColor(GREEN),alignment=TA_LEFT,spaceAfter=10)
    y=0
    page=0
    def para(txt,size=10.5,leading=None,color=GREEN,space=13,bold=False,width=491,x=52):
        nonlocal y
        s=ParagraphStyle('p',parent=style,fontName='Bold' if bold else 'Body',fontSize=size,leading=leading or size*1.5,textColor=HexColor(color))
        p=Paragraph(txt.replace('—','-').replace('–','-'),s)
        _,h=p.wrap(width,10000)
        if y-h<65: raise ValueError(f'Content exceeds page {page}: {txt[:70]}')
        p.drawOn(c,x,y-h);y-=h+space
    def start(kicker,title=None,size=(595,842),anchor=None):
        nonlocal y,page
        if page:c.showPage()
        page+=1;c.setPageSize(size);w,h=size
        c.setFillColor(HexColor(CREAM));c.rect(0,0,w,h,fill=1,stroke=0)
        c.setFillColor(HexColor(GREEN));c.setFont('Bold',10);c.drawString(52,h-43,'StoreAssist')
        c.setFillColor(HexColor(MUTED));c.setFont('Body',8);c.drawRightString(w-52,h-43,kicker)
        c.setStrokeColor(HexColor(LINE));c.line(52,48,w-52,48)
        c.setFont('Body',8);c.drawString(52,31,'ЗАПРОС ТОВАРА СО СКЛАДА');c.drawRightString(w-52,31,f'{page:02}')
        if anchor:c.bookmarkPage(anchor)
        y=h-93
        if title:para(title,25,30,space=25,bold=True,width=w-104)
    start('БИЗНЕС-АНАЛИЗ / КЕЙС',anchor='cover')
    y=680
    para('От запроса со склада<br/>до понятного результата',34,41,bold=True,space=28)
    para('Как сообщать о неудачном поиске, передавать работу с сохранением ответственного и помогать продавцу предложить альтернативу.',14,22,color=MUTED,space=35)
    c.setFillColor(HexColor(SAGE));c.roundRect(52,245,491,158,18,fill=1,stroke=0)
    y=378
    for i,(a,b) in enumerate([('Запрос','Точный размер и цвет'),('Поиск','Стеллаж и секция'),('Результат','Передан / Не найдено'),('Следующий шаг','Альтернатива / проверка')]):
        x=72+i*117
        c.setFillColor(HexColor(MUTED));c.setFont('Body',8);c.drawString(x,375,f'0{i+1}')
        p=Paragraph(f'<b>{a}</b><br/>{b}',ParagraphStyle('f',parent=style,fontSize=9,leading=16))
        _,h=p.wrap(105,90);p.drawOn(c,x,350-h)
    y=200
    para('В основе - мой опыт работы в Massimo Dutti в 2021-2022 годах. В кейсе подготовлены целевой процесс, требования и интерактивный прототип.',10.5,16,color=MUTED)
    start('01 / КОНТЕКСТ И ВКЛАД','Откуда появилась задача')
    para('Я работал в Massimo Dutti и пользовался iPod Stock Query: проверял наличие и отправлял запрос товара со склада. В очереди были видны запросы, а сотруднику склада - стеллаж и секция.')
    para('Продавец отменял запрос через iPod; склад видел отмену и подтверждал передачу на терминале. Сотрудник склада находил продавца в торговом зале и выносил ему вещь.')
    para('Если товар не находили, сотрудник склада сообщал об этом лично в зале. Ожидание могло затянуться, а покупатель - уйти. Пока результат не был известен, продавцу было трудно предложить следующий шаг.',12,18,space=24)
    para('Моя работа в кейсе',16,21,bold=True)
    for t in ['Описал известный AS-IS и подготовил TO-BE для зала и склада.','Разделил ответственность за обслуживание, поиск и проверку расхождений.','Определил правила отмены, передачи работы, проверки наличия и альтернатив.','Связал требования со сценариями, экранами и критериями приёмки.','Подготовил восемь диаграмм, прототип и план измерения эффекта.']:
        para('• '+t,space=9)
    y-=10
    para('Границы',16,21,bold=True)
    para('Один магазин, один точный вариант и одна единица в запросе. Каталог, наличие и размещение поступают из существующих источников. Резервирование, продажи и учётные исправления остаются за пределами модуля.',color=MUTED)
    start('02 / ОСНОВНЫЕ РЕШЕНИЯ','Что меняется в процессе')
    for num,title,txt in [
        ('01','Результат поиска приходит в iPod','Склад отмечает «Не найдено» и при желании добавляет комментарий. Продавец видит результат без личного сообщения в зале и может обсудить другой вариант. Система учитывает недавний неудачный поиск того же размера и цвета.'),
        ('02','Передача работы требует принятия','Поиск на складе и обслуживание в зале передаются отдельно. До принятия отвечает прежний сотрудник. Новый исполнитель получает контекст; исходное время запроса и складские назначения сохраняются.'),
        ('03','У расхождения есть ответственный','Старший склада ведёт отдельное обращение до результата. Повторный эпизод дополняет открытую проверку. Закрытие обращения не переписывает исход выдачи и не меняет учёт автоматически.'),
        ('04','Альтернатива - новый связанный запрос','Другой размер, цвет или товар из готовых связей каталога согласуется с покупателем. После проверки наличия создаётся новый запрос в том же обслуживании. Исходный поиск и результат сохраняются.')]:
        para(num+' / '+title,14,20,bold=True,space=9)
        para(txt,color=MUTED,space=25)
    start('03 / ПРАВИЛА','Почему процесс устроен так')
    for title,txt in [
        ('Не найдено не означает «нет в учёте»','Неудача одной попытки предупреждает о риске, но сама не запрещает новый запрос. Наблюдение сотрудника хранится отдельно от адреса и остатка источника.'),
        ('Перед отправкой - новое чтение наличия','Актуальный ноль запрещает отправку. Неизвестные или устаревшие сведения требуют предупреждения и явного подтверждения продавца.'),
        ('Ответственность сохраняется до принятия','Если коллега не ответил или отказался, задача остаётся у прежнего сотрудника. Продавец выбирает другого коллегу; при необходимости помогает руководитель.'),
        ('Готовность ещё не означает передачу','Состояние «Передан» сохраняет сотрудник склада после фактической передачи. Отмена начатой работы разрешается по фактам; при споре помогает руководитель.')]:
        para(title,13,19,bold=True,space=7);para(txt,color=MUTED,space=21)
    para('Стартовые настройки пилота',15,21,bold=True)
    para('<b>5 минут</b> от создания - визуальная пометка ожидания. Она не меняет состояние и исполнителя.<br/><b>2 часа</b> от «Не найдено» - предупреждение по тому же магазину и варианту; подтверждённое нахождение снимает его раньше.',space=12)
    para('Это проектные настройки для проверки в пилоте, а не измеренный эффект или подтверждённый SLA.',9.5,14,color=MUTED)
    start('04 / ОЦЕНКА И ПРОВЕРКА','Как проверить полезность')
    para('Измеренных результатов пилота пока нет. Для оценки эффекта подготовлены определения показателей и правила сравнения.',12,18,color=MUTED,space=22)
    for tag,title,txt in [
      ('M-08','Задержка сообщения «Не найдено»','Медиана и P90 от завершения неудачного поиска до ознакомления продавца с результатом. В AS-IS - личное сообщение, в TO-BE - результат в iPod. Техническое прочтение само по себе не доказывает ознакомление.'),
      ('M-09','Повторный безрезультатный поиск','Доля повторных «Не найдено» среди новых запросов с прошлым неудачным поиском того же варианта менее двух часов назад. Размер группы и остальные исходы учитываются отдельно.'),
      ('M-01','Время до передачи','Медиана и P90 от создания до подтверждения фактической передачи; только завершённые передачи. Рядом учитываются открытые запросы и отмены «покупатель ушёл».')]:
        para(tag+' / '+title,12,18,bold=True,space=6);para(txt,10,15,color=MUTED,space=18)
    para('Что проверено в прототипе',15,21,bold=True,space=8)
    para('<b>137 автоматических проверок:</b> 53 модели и 84 интерфейсной логики. Из 69 критериев 62 проверены локально; 7 частичны из-за серверной авторизации и реальной конкурентности.',10,15)
    para('Тесты используют имитацию DOM и событий. Отрисовка в браузере, клавиатура устройства и реальные источники не подтверждены. Данные демонстрационные; локальные тесты не являются приёмкой рабочей системы.',9.5,14,color=MUTED)
    start('05 / МАТЕРИАЛЫ','Как читать комплект')
    para('Кейс объясняет проблему и решения. Документы раскрывают правила, сценарии, экраны и критерии приёмки. Прототип позволяет пройти поведение на демонстрационных данных.',color=MUTED,space=20)
    for title,txt in [('Процесс и участники','AS-IS / TO-BE · Роли и границы · Диаграммы'),('Поведение модуля','Требования и правила · Проектные решения · Сценарии · Карта экранов'),('Проверка','Метрики и критерии приёмки · Прототип · Рабочая карта покрытия')]:
        para(title,12,18,bold=True,space=5);para(txt,10,15,color=MUTED,space=15)
    para('Готовые диаграммы',15,21,bold=True,space=12)
    for idx,(_,title,_) in enumerate(DIAGRAMS):
        para(f'<link href="#diagram-{idx+1}" color="{GREEN}">{idx+1:02}. {title} - страница {idx+7}</link>',10,15,space=8)
    para('Схемы включены без перестройки. Для чтения мелких деталей используйте масштабирование PDF или отдельные SVG и исходники из комплекта.',9,14,color=MUTED,space=0)
    for idx,(stem,title,caption) in enumerate(DIAGRAMS):
        source=ROOT/'assets/diagrams'/f'{stem}.png'
        iw,ih=Image.open(source).size
        # Preserve the original diagram scale: ~1 PDF point per source SVG unit.
        w=max(1050,iw/2+104);h=ih/2+240
        start(f'СХЕМА {idx+1:02} / '+('AS-IS' if idx==0 else 'ПРОЕКТНЫЙ TO-BE'),None,(w,h),f'diagram-{idx+1}')
        para(title,23,29,bold=True,width=w-104,space=9)
        para(caption,11,17,color=MUTED,width=w-104,space=12)
        c.drawImage(str(source),52,68,width=iw/2,height=ih/2,preserveAspectRatio=True,mask='auto')
        c.addOutlineEntry(title,f'diagram-{idx+1}',level=0)
    c.save()

def build(output):
    if output.exists(): raise FileExistsError(f'Output already exists: {output}')
    output.mkdir(parents=True)
    (output/'site.css').write_text(CSS,encoding='utf-8')
    shutil.copytree(ROOT/'assets',output/'assets')
    shutil.copytree(ROOT/'prototype/dist',output/'prototype/dist')
    for part in ['qa','tests']:
        if (ROOT/'prototype'/part).exists():
            shutil.copytree(ROOT/'prototype'/part,output/'prototype'/part)
    pdf=ROOT/'output/pdf/case-storeassist.pdf'
    build_pdf(pdf)
    (output/'output/pdf').mkdir(parents=True)
    shutil.copy2(pdf,output/'output/pdf/case-storeassist.pdf')
    docs={
      'Процесс и участники':[('01-PROCESS-AS-IS-TO-BE','AS-IS / TO-BE'),('03-STAKEHOLDERS-AND-SCOPE','Роли и границы'),('06-DIAGRAMS','Диаграммы и исходники')],
      'Поведение модуля':[('02-REQUIREMENTS','Требования и правила'),('05-DECISIONS-AND-QUESTIONS','Проектные решения'),('07-USE-CASES','Сценарии'),('08-SCREEN-MAP','Карта экранов')],
      'Проверка':[('04-METRICS-AND-ACCEPTANCE','Метрики и критерии приёмки'),('09-PROTOTYPE','Прототип и сценарии демонстрации'),('10-PROTOTYPE-ACCEPTANCE','Рабочая карта покрытия')]
    }
    doclinks=''.join('<div><h3>'+title+'</h3><ul>'+''.join(f'<li><a href="docs/{stem}.html">{name}</a></li>' for stem,name in rows)+'</ul></div>' for title,rows in docs.items())
    gallery=''.join(f'<a class="diagram" href="assets/diagrams/{stem}.svg" data-diagram="{stem}" data-title="{title}"><figure><img src="assets/diagrams/{stem}.png" alt="Схема {i+1:02}: {title}" loading="lazy"><figcaption><b>{i+1:02} / {title}</b><span>{caption}</span></figcaption></figure></a>' for i,(stem,title,caption) in enumerate(DIAGRAMS))
    changes=[('01','Результат поиска в iPod','«Не найдено» появляется у продавца; личное сообщение в зале больше не является единственным способом узнать результат.'),('02','Передача с принятием','Коллега получает работу и контекст. До его принятия отвечает прежний сотрудник; поиск и обслуживание передаются отдельно.'),('03','Проверка расхождения','Старший склада ведёт отдельное обращение до результата. Наблюдение не переписывает остаток или адрес источника.'),('04','Связанная альтернатива','Другой вариант согласуется с покупателем и оформляется новым запросом. Исходный поиск сохраняется в истории.')]
    changehtml=''.join(f'<article class="change"><span class="eyebrow">{num} / Изменение</span><h3>{title}</h3><p>{txt}</p></article>' for num,title,txt in changes)
    body=f'''
<section class="hero"><div><span class="eyebrow">Бизнес-анализ · Розничный магазин</span><h1>От запроса со склада до понятного результата</h1><p class="lead">StoreAssist помогает продавцу узнать результат поиска, сохранить ответственного при передаче работы и предложить покупателю следующий шаг.</p><div class="actions"><a class="button primary" href="prototype/dist/index.html?v=design17">Открыть прототип ↗</a><a class="button" href="output/pdf/case-storeassist.pdf">Читать PDF ↓</a></div></div><aside class="flow" aria-label="Основной путь"><span class="eyebrow">Один точный вариант</span><ol><li><strong>Запросить товар</strong><span>Размер, цвет и проверка наличия</span></li><li><strong>Выполнить поиск</strong><span>Стеллаж, секция и предыдущие попытки</span></li><li><strong>Сообщить результат</strong><span>Передача или «Не найдено»</span></li><li><strong>Продолжить обслуживание</strong><span>Альтернатива или проверка расхождения</span></li></ol></aside></section>
<section class="section intro" id="process"><div><span class="eyebrow">Контекст / 2021-2022</span><h2>Ожидание без понятного исхода</h2></div><div><p>Я работал в Massimo Dutti и пользовался iPod Stock Query. Продавец проверял наличие и отправлял запрос, склад искал вещь по стеллажу и секции, выносил её в зал и подтверждал передачу на терминале.</p><p>Если товар не находили, сотрудник склада лично сообщал об этом продавцу. Ожидание могло затянуться, а покупатель - уйти.</p><p><b>Моя работа в кейсе - бизнес-анализ процесса.</b> Я описал AS-IS / TO-BE, разделил ответственность, подготовил требования, сценарии, диаграммы, прототип и план измерения эффекта.</p><a href="docs/case-storeassist.html">Читать единый кейс →</a></div></section>
<section class="section"><span class="eyebrow">TO-BE</span><h2>Четыре изменения процесса</h2><div class="changes">{changehtml}</div><p class="note">Ненахождение в одной попытке ещё не доказывает отсутствие товара. Предупреждение помогает принять решение; актуальный ноль из источника запрещает отправку. Ответственность меняется после принятия коллегой.</p></section>
<section class="section"><span class="eyebrow">План измерения</span><h2>Что покажет полезность</h2><div class="metrics"><article class="metric"><span class="eyebrow">M-08</span><h3>Задержка сообщения «Не найдено»</h3><p>Медиана и P90 от завершения поиска до ознакомления продавца с результатом.</p><a href="docs/04-METRICS-AND-ACCEPTANCE.html#m-08">Определение →</a></article><article class="metric"><span class="eyebrow">M-09</span><h3>Повторный безрезультатный поиск</h3><p>Доля повторных «Не найдено» после недавней неудачной попытки по тому же варианту.</p><a href="docs/04-METRICS-AND-ACCEPTANCE.html#m-09">Правила расчёта →</a></article><article class="metric"><span class="eyebrow">M-01</span><h3>Время до передачи</h3><p>Медиана и P90 успешной выдачи; рядом учитываются незавершённые запросы и отмены.</p><a href="docs/04-METRICS-AND-ACCEPTANCE.html#m-01">Границы показателя →</a></article></div><p class="note">Измеренных результатов пилота пока нет. Пометка ожидания с 5 минут и предупреждение о прошлом поиске на 2 часа - стартовые настройки для проверки.</p></section>
<section class="section" id="diagrams"><span class="eyebrow">Процессы / Поведение</span><h2>Восемь готовых диаграмм</h2><p class="diagram-help">Откройте схему для просмотра в полном размере. В окне доступны SVG и редактируемый исходник.</p><div class="diagram-grid">{gallery}</div></section>
<section class="section" id="documents"><span class="eyebrow">Прослеживаемость</span><h2>Аналитические материалы</h2><div class="docs">{doclinks}</div></section>
<section class="section intro"><div><span class="eyebrow">Результат работы</span><h2>Процесс, требования и работающий макет</h2></div><div><div class="status"><div><strong>137</strong><small>локальных проверок</small></div><div><strong>62 / 69</strong><small>критерия проверены локально</small></div></div><p>Семь критериев частичны из-за серверной авторизации и реальной конкурентности. Тесты модели и интерфейсной логики используют имитацию событий; они не подтверждают отрисовку браузера.</p><p>Проверка на устройствах и измерение бизнес-эффекта остаются следующими этапами.</p><div class="actions"><a class="button primary" href="prototype/dist/index.html?v=design17">Пройти сценарий ↗</a><a class="button" href="docs/10-PROTOTYPE-ACCEPTANCE.html">Посмотреть покрытие</a></div></div></section>
<dialog id="diagram-dialog" aria-labelledby="diagram-title"><div class="dialog-bar"><div><strong id="diagram-title"></strong><div class="dialog-actions"><a id="diagram-svg">Открыть SVG ↗</a><a id="diagram-source" download>Скачать исходник ↓</a></div></div><button class="close" id="diagram-close" aria-label="Закрыть схему">×</button></div><div class="diagram-view" tabindex="0" aria-label="Схема в полном размере; прокрутите для просмотра"><img id="diagram-image" alt=""></div></dialog><script src="site.js" defer></script>'''
    (output/'index.html').write_text(shell('Кейс',body),encoding='utf-8')
    (output/'site.js').write_text('''const dialog=document.getElementById('diagram-dialog');let opener=null;document.querySelectorAll('[data-diagram]').forEach(link=>link.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||!dialog.showModal)return;event.preventDefault();opener=link;const stem=link.dataset.diagram;document.getElementById('diagram-title').textContent=link.dataset.title;const img=document.getElementById('diagram-image');img.src=`assets/diagrams/${stem}.svg`;img.alt=link.dataset.title;const widths={'01-bpmn-as-is':2574,'02-bpmn-to-be':3250,'03-bpmn-create-request':2824,'04-bpmn-cancellation':3024,'05-bpmn-discrepancy':2874,'06-bpmn-search-handover':2692,'07-bpmn-service-handover':3874,'08-request-states':1900};img.style.setProperty('--diagram-width',`${widths[stem]}px`);document.getElementById('diagram-svg').href=img.src;document.getElementById('diagram-source').href=`assets/diagrams/${stem}.${stem.startsWith('08')?'puml':'bpmn'}`;dialog.showModal();dialog.querySelector('.diagram-view').scrollTo(0,0);document.getElementById('diagram-close').focus();}));document.getElementById('diagram-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>opener?.focus());''',encoding='utf-8')
    # Render the original Markdown, retaining all explicit requirement anchors.
    sources=[ROOT/'README.md',*(ROOT/'docs').rglob('*.md'),ROOT/'prototype/README.md',ROOT/'prototype/QA.md']
    for source in sources:
        rel=source.relative_to(ROOT)
        if rel==Path('README.md'): rel=Path('documents.html')
        else: rel=rel.with_suffix('.html')
        target=output/rel;target.parent.mkdir(parents=True,exist_ok=True)
        prefix='../'*(len(rel.parts)-1)
        txt=source.read_text(encoding='utf-8-sig')
        title=next((s[2:] for s in txt.splitlines() if s.startswith('# ')),source.stem)
        rendered=markdown.markdown(txt,extensions=['tables','fenced_code','toc','sane_lists'],extension_configs={'toc':{'slugify':slugify}},output_format='html')
        explicit=set(re.findall(r'<a\b[^>]*\bid="([^"]+)"',rendered))
        rendered=re.sub(r'(<h[1-6]) id="([^"]+)"',lambda m:m[1] if m[2] in explicit else m[0],rendered)
        def rewrite(match):
            attr,url=match.groups();parts=urlsplit(html.unescape(url))
            if parts.scheme or parts.netloc:return match.group(0)
            path=parts.path
            if path.endswith('.md'):path=path[:-3]+'.html'
            if path=='../README.html' and len(rel.parts)==2:path='../documents.html'
            if path=='README.html' and len(rel.parts)==1:path='documents.html'
            new=urlunsplit(('', '',path,parts.query,parts.fragment))
            return f'{attr}="{html.escape(new,quote=True)}"'
        rendered=re.sub(r'(href|src)="([^"]*)"',rewrite,rendered)
        rendered=re.sub(r'(<table>.*?</table>)',r'<div class="table-scroll" tabindex="0" aria-label="Таблица с горизонтальной прокруткой">\1</div>',rendered,flags=re.S)
        target.write_text(shell(title,'<a href="'+prefix+'index.html">← Кейс StoreAssist</a>'+rendered,prefix,True),encoding='utf-8')
    # Preserve downloadable Markdown and editable diagram sources.
    shutil.copytree(ROOT/'docs',output/'docs',dirs_exist_ok=True)
    shutil.copy2(ROOT/'README.md',output/'README.md')
    for name in ['README.md','QA.md']:shutil.copy2(ROOT/'prototype'/name,output/'prototype'/name)
    (output/'.nojekyll').touch()
    print(f'Built PDF and site: {output}')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=ROOT/'pages-build')
    build(parser.parse_args().output.resolve())
