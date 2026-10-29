"""Existing app + planning flows, real Chromium. Start npm run dev first.
Uses Playwright for Python; CHROMIUM_PATH and SOLOCFO_URL are optional.
"""
import json
import os
import re
import shutil
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

URL = os.environ.get('SOLOCFO_URL', 'http://127.0.0.1:8080')
OUTPUT = Path(__file__).resolve().parents[1] / 'test-results'
OUTPUT.mkdir(exist_ok=True)
checks = []


def passed(name):
    checks.append(name)
    print('PASS:', name, flush=True)


def go(page, route):
    page.locator(f'[data-go="{route}"]:visible').first.click()


def change(page, path, value):
    field = page.locator(f'[data-model="{path}"]')
    field.fill(str(value))
    field.press('Tab')


def amount(page, testid):
    text = page.get_by_test_id(testid).inner_text().split('/')[0]
    return float(re.sub(r'[^\d,.-]', '', text).replace('.', '').replace(',', '.'))


def project(page):
    return page.evaluate("JSON.parse(localStorage.getItem('solocfo-mvp-v2'))")


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'), headless=True, args=['--no-sandbox'])
    context = browser.new_context(viewport={'width':1440,'height':1050}, service_workers='block', accept_downloads=True)
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(URL)
    expect(page.locator('h1')).to_contain_text('Klar im Blick')
    page.screenshot(path=str(OUTPUT/'cockpit-desktop.png'), full_page=True)
    for route in ['analysis','decisions','business','data','report','about']:
        go(page, route)
        expect(page.locator('h1')).to_be_visible()
    assert not errors, errors
    passed('Alle bisherigen Arbeitsbereiche starten ohne JavaScript-Fehler')

    go(page,'valuation')
    base_value = amount(page,'equity-value')
    change(page,'valuation.wacc',12)
    assert amount(page,'equity-value') < base_value
    change(page,'valuation.wacc',2)
    expect(page.get_by_role('alert')).to_contain_text('WACC muss größer')
    expect(page.get_by_test_id('equity-value')).to_have_text('–')
    change(page,'valuation.wacc',10)
    change(page,'valuation.years.0.capexPct','')
    expect(page.get_by_role('alert')).to_contain_text('Investitionen')
    change(page,'valuation.years.0.capexPct',4)
    assert amount(page,'equity-value') == base_value
    with page.expect_download() as item:
        page.locator('[data-action="export-dcf"]').click()
    csv = Path(item.value.path()).read_text(encoding='utf-8-sig')
    assert 'Nachhaltige Reinvestition' in csv and 'Eigenkapitalwert' in csv
    page.screenshot(path=str(OUTPUT/'dcf-desktop.png'),full_page=True)
    passed('DCF: Eingaben wirken, unzulässige Annahmen sperren den Wert, vollständiger CSV-Export')

    go(page,'hourly')
    rate = amount(page,'hourly-price')
    change(page,'hourlyPlan.teams.0.monthlyGross',4100)
    assert amount(page,'hourly-price') > rate
    change(page,'hourlyPlan.teams.0.vacation',240)
    expect(page.get_by_role('alert')).to_contain_text('Ausfalltage')
    expect(page.get_by_test_id('hourly-price')).to_contain_text('–')
    change(page,'hourlyPlan.teams.0.vacation',25)
    change(page,'hourlyPlan.teams.0.monthlyGross',3400)
    assert amount(page,'hourly-price') == rate
    page.locator('[data-action="add-team"]').click()
    assert page.locator('.team-editor').count() == 4
    page.locator('.team-editor').last.locator('summary').click()
    page.locator('[data-remove-team="3"]').click()
    assert page.locator('.team-editor').count() == 3
    with page.expect_download() as item:
        page.locator('[data-action="export-hourly"]').click()
    csv = Path(item.value.path()).read_text(encoding='utf-8-sig')
    assert 'Monatsbrutto' in csv and 'Netto-Zielstundensatz' in csv
    page.screenshot(path=str(OUTPUT/'stundensatz-desktop.png'),full_page=True)
    passed('Stundensatz: Personalkosten, ungültige Zeitbudgets, Gruppen hinzufügen/löschen, Export')

    go(page,'scenario')
    page.locator('[data-preset="price"]').click()
    assert amount(page,'scenario-ebitda') == 139600
    change(page,'scenarioName','Preisalternative')
    page.locator('[data-action="save-scenario"]').click()
    expect(page.locator('.scenario-table')).to_contain_text('Preisalternative')
    go(page,'scenario')
    page.locator('[data-preset="downside"]').click()
    change(page,'scenarioName','Risiko Auftragsrückgang')
    page.locator('[data-action="save-scenario"]').click()
    expect(page.locator('.scenario-table')).to_contain_text('Risiko Auftragsrückgang')
    assert page.locator('[data-load-scenario]').count() == 2
    page.locator('[data-load-scenario]').first.click()
    assert amount(page,'scenario-ebitda') == 139600
    page.reload()
    go(page,'decisions')
    assert page.locator('[data-load-scenario]').count() == 2
    passed('Szenarien: Preiswirkung, Alternativen speichern/vergleichen/laden, Browser-Neustart')

    go(page,'data')
    with page.expect_download() as item:
        page.locator('[data-action="backup"]').click()
    backup = Path(item.value.path()).read_bytes()
    data = json.loads(backup)
    assert len(data['savedScenarios']) == 2 and len(data['valuation']['years']) == 5
    page.locator('#backupFile').set_input_files({'name':'backup.json','mimeType':'application/json','buffer':backup})
    expect(page.locator('h1')).to_contain_text('Klar im Blick')
    assert project(page)['demo'] is True
    passed('JSON-Backup stellt Planmodelle und Szenarien wieder her und erhält die Demo-Kennzeichnung')

    go(page,'data')
    before = project(page)
    invalid = dict(before)
    invalid['savedScenarios'] = [{'name':'bad'}]
    page.locator('#backupFile').set_input_files({'name':'invalid.json','mimeType':'application/json','buffer':json.dumps(invalid).encode()})
    expect(page.locator('#notification')).to_contain_text('Ungültiges gespeichertes Szenario')
    assert project(page) == before
    passed('Beschädigtes Backup wird ohne Datenverlust abgewiesen')

    csv = b'year;revenue;material;personnel;overhead\n2024;100000;30000;40000;10000\n2025;120000;40000;45000;10000\n'
    page.locator('#csvFile').set_input_files({'name':'test.csv','mimeType':'text/csv','buffer':csv})
    expect(page.locator('h1')).to_have_text('Finanzanalyse')
    go(page,'scenario')
    expect(page.get_by_test_id('cash-impact')).to_have_text('–')
    go(page,'valuation')
    page.locator('[data-action="dcf-from-actual"]').click()
    expect(page.locator('#notification')).to_contain_text('fehlen')
    assert project(page)['valuation']['revenue'] == 2320000
    passed('CSV ohne Bilanzdaten: EBITDA nutzbar, Cashflow und Ist-Übernahme werden nicht erfunden')

    # Reports retain meaningful model context and can actually be rendered to PDF.
    go(page,'report')
    expect(page.locator('.report-page')).to_contain_text('DCF')
    page.pdf(path=str(OUTPUT/'managementbericht.pdf'),format='A4',print_background=True)
    assert (OUTPUT/'managementbericht.pdf').stat().st_size > 10000
    passed('Managementbericht als mehrseitige PDF-Datei gerendert')

    mobile = context.new_page()
    mobile.set_viewport_size({'width':390,'height':844})
    mobile.on('pageerror', lambda e: errors.append(str(e)))
    mobile.goto(URL)
    for width in [390,360,768,1024]:
        mobile.set_viewport_size({'width':width,'height':844})
        for route in ['dashboard','hourly','valuation','scenario','analysis','data','decisions','report','business','about']:
            # Use the visible mobile menu or desktop navigation without modifying app state.
            links = mobile.locator(f'[data-go="{route}"]:visible')
            if not links.count():
                go(mobile,'menu')
            go(mobile,route)
            expect(mobile.locator('h1')).to_be_visible()
            overflow = mobile.evaluate('document.documentElement.scrollWidth > innerWidth + 1')
            assert not overflow, f'Page overflow at {width}px: {route}'
    mobile.set_viewport_size({'width':390,'height':844})
    go(mobile,'dashboard')
    mobile.screenshot(path=str(OUTPUT/'cockpit-mobil.png'),full_page=True)
    go(mobile,'valuation')
    mobile.screenshot(path=str(OUTPUT/'dcf-mobil.png'),full_page=True)
    passed('10 Bereiche bei 360, 390, 768 und 1024 px ohne horizontalen Seitenüberlauf')
    assert not errors, errors

    # Managed Chromium blocks file:// by policy. Serve the exact single-file artifact
    # from a temporary local server, then disable the network and exercise both models.
    standalone_server = ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parents[1]/'dist')))
    threading.Thread(target=standalone_server.serve_forever,daemon=True).start()
    standalone_url = f'http://127.0.0.1:{standalone_server.server_port}/SoloCFO_v3_Offline.html'
    offline = browser.new_context(viewport={'width':1440,'height':1000},service_workers='block')
    file_page = offline.new_page()
    external = []
    file_page.on('request',lambda req:external.append(req.url) if req.url.startswith(('http://','https://')) and req.url!=standalone_url else None)
    file_page.on('pageerror',lambda e:errors.append(str(e)))
    file_page.goto(standalone_url)
    offline.set_offline(True)
    expect(file_page.locator('h1')).to_contain_text('Klar im Blick')
    go(file_page,'valuation')
    assert amount(file_page,'equity-value') > 0
    go(file_page,'hourly')
    assert amount(file_page,'hourly-price') > 0
    assert not external, external
    assert not errors, errors
    passed('Eigenständige HTML-Ausgabe: DCF und Stundensatz funktionieren ohne weitere Dateien und ohne Netzwerk')
    offline.close()
    standalone_server.shutdown()
    standalone_server.server_close()
    context.close()

    # A full/quota-blocked browser must not falsely report that finance data was saved.
    blocked = browser.new_context(viewport={'width':1440,'height':1000},service_workers='block')
    blocked.add_init_script("Storage.prototype.setItem = function(){throw new DOMException('Quota exceeded','QuotaExceededError')}")
    blocked_page = blocked.new_page()
    blocked_page.goto(URL)
    go(blocked_page,'hourly')
    change(blocked_page,'hourlyPlan.teams.0.monthlyGross',4100)
    expect(blocked_page.locator('.local-status')).to_contain_text('Nicht gespeichert')
    expect(blocked_page.locator('#notification')).to_contain_text('Browser-Speicherung blockiert')
    assert amount(blocked_page,'hourly-price') > rate
    blocked.close()
    passed('Blockierter Browser-Speicher: sichtbarer Fehler statt falscher Speicherbestätigung')

    # Independent context: install service worker, then verify a reload with network disabled.
    pwa = browser.new_context(viewport={'width':1200,'height':900})
    pwa_page = pwa.new_page()
    pwa_page.goto(URL)
    pwa_page.evaluate('navigator.serviceWorker.ready.then(() => true)')
    pwa_page.reload()
    pwa_page.wait_for_function('navigator.serviceWorker.controller !== null')
    pwa.set_offline(True)
    pwa_page.reload()
    go(pwa_page,'valuation')
    assert amount(pwa_page,'equity-value') > 0
    passed('PWA startet nach Service-Worker-Installation auch bei abgeschaltetem Netzwerk')
    pwa.close()
    browser.close()

print(f'PASS: {len(checks)} Browser-Prüfgruppen, keine JavaScript-Fehler',flush=True)
