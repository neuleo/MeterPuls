# MeterPuls: Redesign- und Umsetzungsplan

**Status:** Planung, keine Implementierung. Die Bestandsaufnahme beruht auf dem Quellcode, nicht auf einem Gerätetest.

**Ziel:** Auf dem Handy sollen drei Fragen schnell beantwortbar sein: Was kostet mein Verbrauch gerade? Was ändert sich als Nächstes? Wie erfasse ich einen Zählerstand? Die vorhandene mobile Navigation bleibt erhalten. Vorrang vor dem visuellen Umbau hat die korrekte zeitliche Zuordnung der Kosten.

## 1. Verträge planen

Heute erlaubt `backend/models.py` nur einen Vertrag pro Kategorie. `backend/routers/contracts.py` speichert Änderungen anhand der Kategorie. Auch die Übernahme eines Scans in `frontend/src/components/ContractSettings.tsx` nutzt diesen Weg. Ein heute eingetragener Folgevertrag kann deshalb den laufenden überschreiben.

**Grundregel:** Ein Folgevertrag erhält eine eigene Laufzeit. Eine Preisänderung beginnt nur einen neuen Preisabschnitt im selben Vertrag. Beide dürfen heute erfasst werden und erst später wirksam sein.

In der Ansicht **Verträge** pro Kategorie zuerst den aktiven Vertrag und direkt darunter die nächste Änderung zeigen. Frühere Verträge bleiben unter **Verlauf** erreichbar. Zwei benannte Aktionen ersetzen das mehrdeutige „Bearbeiten“:

| Aktion | Ablauf | Ergebnis |
| --- | --- | --- |
| Folgevertrag planen | Kategorie wählen, Daten eingeben oder scannen, Startdatum und Konditionen prüfen, Übergang bestätigen. | Vorschau: „Alter Vertrag bis 31.03., neuer Vertrag ab 01.04.“ Bis dahin bleiben aktiver Tarif und bisherige Kosten unverändert. |
| Preisänderung eintragen | Aktiven oder geplanten Vertrag öffnen, „Gültig ab“ wählen, Arbeits- oder Grundpreis ändern, Alt und Neu vergleichen, bestätigen. | Anbieter, Vertragsbeginn und Bonus bleiben erhalten. Nicht geänderte Preisbestandteile gelten weiter. |

Ein Scan liefert einen **Entwurf**. Fehlende Daten werden abgefragt; erst die Bestätigung speichert den Vertrag. Geplante Änderungen lassen sich korrigieren oder zurücknehmen. Vorher zeigt die Vorschau den resultierenden Verlauf. Eine rückwirkende Korrektur erfordert eine separate Bestätigung, die das früheste betroffene Datum nennt.

## 2. Daten und Berechnung

| Bereich | Vorgabe für die Umsetzung |
| --- | --- |
| Laufzeit | Verträge über ihre ID adressieren. Starttag inklusive, Ende intern exklusiv behandeln. Beim Wechsel einen offenen Vorgänger nur nach Bestätigung begrenzen; beide Änderungen gemeinsam speichern. Überschneidungen serverseitig ablehnen. Eine echte Lücke zulassen und als „Kein Tarif hinterlegt“ anzeigen, nicht als 0 €. |
| Preisverlauf | Preisabschnitte gehören zu einer Vertrags-ID, mit eindeutigem Startdatum innerhalb ihrer Laufzeit. Der erste beginnt am Vertragsstart. Für jeden Leistungstag den dann gültigen Preis bestimmen. „Aktiv“, „Geplant“ und „Beendet“ anhand des Stichtags ermitteln; kein nächtlicher Umschaltjob nötig. |
| Kosten | Die Tagesaufteilung in `backend/calculations.py` nutzen. Fehlt am Wechseltag eine Ablesung, den Intervallverbrauch nach der bestehenden Verteilung aufteilen und die Aufteilung als Schätzung kennzeichnen. Monatlichen Grundpreis nach den tatsächlichen Kalendertagen anteilig berechnen. Bonus höchstens einmal je Vertrag berücksichtigen; Abschläge getrennt von Kosten ausweisen. |
| Ist und Prognose | Vor Vertragsbeginn weder Ist-Kosten noch geleistete Abschläge ansetzen. Eine Prognose darf bekannte Folgepreise verwenden, nennt ihren Zeitraum und behält die saisonale Gasgewichtung bei. Bei Tariflücken berechenbare Kosten nur als Teilsumme ausweisen. |
| Einheiten | Zähler- und Preiseinheit getrennt behandeln. Gas in m³ nicht direkt mit €/kWh multiplizieren. Fehlt eine bestätigte Umrechnung, den Verbrauch anzeigen und erklären, warum kein Eurobetrag ausgewiesen wird. |
| Ausgabe | `backend/routers/analytics.py`, `backend/export_service.py` und `frontend/src/components/CategoryDetailDashboard.tsx` sollen dieselbe Kostenaufschlüsselung verwenden. Die lokale Preisrechnung der Detailansicht ablösen. Energiepreis, Grundpreis, Bonus und Zahlungen unterscheidbar halten. |
| Migration | Die SQLite-Struktur in `backend/database.py` kontrolliert migrieren. Datenbank vorher sichern; für jeden Altvertrag einen Vertrag samt erstem Preisabschnitt ab bisherigem Beginn übernehmen. IDs und Werte prüfen und die Migration an einer Kopie zweimal starten. Keine unbekannten historischen Preise erfinden. |

## 3. Mobile Oberfläche

| Ansicht | Geplante Änderung |
| --- | --- |
| Übersicht | Je Kategorie zuerst letzten Stand mit Datum, Kosten mit Zeitraum und nächste Änderung zeigen, z. B. „Strom · ab 1. April: 32 statt 29 ct/kWh“. Diagramme folgen darunter. Auf schmalen Displays beschriftete Zeilen statt horizontal scrollender Vergleichstabelle verwenden; auf Desktop die Tabelle behalten. |
| Kategoriedetail | „Stand erfassen“ und „Historie“ direkt beim letzten Stand platzieren. Ist-Kosten und Prognose sichtbar unterscheiden. Wasser weiterhin als Kosten darstellen, nicht als Guthaben oder Nachzahlung. |
| Erfassung | Die zentrale Aktion bietet „Foto aufnehmen“, „Fotos auswählen“ und „Manuell eingeben“. Den bestehenden manuellen Ablauf aus `ReadingHistoryModal.tsx` wiederverwenden. Aus einer Zähleransicht heraus den Zähler vorauswählen. Eingabe ohne Kamera und ohne konfigurierte KI ermöglichen. |
| Fehler und Rückmeldung | In `ScanMeterModal.tsx` beim Mehrfachscan pro Foto den Speicherstatus anzeigen. Nur fehlgeschlagene Einträge erneut senden; auch bei verlorener Serverantwort darf beim Wiederholen kein Duplikat entstehen. Nach Erfolg Stand, Historie und betroffene Auswertung ohne Tabwechsel aktualisieren. |
| Navigation und Bedienbarkeit | Untere Navigation behalten. Übersicht, Kategorie und Vertrag über URLs erreichbar machen, damit Zurück und Neuladen funktionieren. Zoomsperre aus `frontend/index.html` entfernen. Dialoge beschriften, Fokus beim Schließen zurückgeben und Speichern auch mit Bildschirmtastatur erreichbar halten. |
| Leere Ansichten | Statt leerer Charts die passende Aktion zeigen: „Ersten Zähler anlegen“, „Ersten Stand erfassen“ oder „Tarif ergänzen“. Ein fehlender Tarif darf die Ablesung nicht blockieren. |

## 4. Umsetzungsreihenfolge

1. **Bestand absichern.** Referenzfälle für Einzelvertrag, Monatswechsel, Bonus und Exporte anlegen. Heutige Widersprüche zwischen Ansichten dokumentieren, nicht als Sollwert festschreiben.
2. **Vertragskern liefern.** Migration, datierte Verträge und Preisabschnitte, Validierung und gemeinsame Kostenberechnung umsetzen. Dashboard, Detail und Export auf dieselbe Berechnung umstellen, bevor mehrere Verträge angelegt werden können.
3. **Vertragsplanung liefern.** Verlauf, beide Eingabeabläufe, Scan-Entwurf, Übergangsvorschau und Rücknahme geplanter Änderungen umsetzen. Ein künftiger Wechsel muss auf dem Handy planbar sein, ohne heutige Zahlen zu verändern.
4. **Mobile Hauptabläufe verbessern.** Manuelle Erfassung sichtbar machen, Mehrfachscan absichern, Daten nach dem Speichern aktualisieren und Übersicht verdichten. Navigation, Zoom, Kamera und Tastatur auf einem echten Telefon prüfen.
5. **Spätere Erweiterungen.** Zuerst eine Ableseerinnerung zum Tarifwechsel erwägen: Ein echter Stand am Stichtag macht eine Schätzung unnötig. Danach einen Tarifvergleich mit eigenem Jahresverbrauch prüfen, der Arbeits- und Grundpreis sowie einmalige Boni getrennt zeigt. Beides ist keine Voraussetzung für die erste Version.

## 5. Abnahmekriterien

| Testfall | Erwartetes Ergebnis |
| --- | --- |
| Preiswechsel zwischen zwei Ablesungen | Bei angenommenen 10 kWh je Tag, 0,30 €/kWh bis 31.03. und 0,40 €/kWh ab 01.04. kosten der 31.03. und 01.04. zusammen **7,00 €** reine Energie. Der Stichtag zählt genau einmal. Dashboard, Detail und Export stimmen für dieselben Bestandteile überein. |
| Folgevertrag in der Zukunft | Im März einen Vertrag ab 01.04. planen: Der März bleibt unverändert, der Folgevertrag hat noch keine Ist-Kosten. Am 01.04. gilt er ohne Nutzeraktion. Rücknahme vor Beginn stellt den vorherigen Verlauf wieder her. |
| Konflikte und Lücken | Eine Überschneidung wird mit konkreten Daten erklärt und nicht still gespeichert. Bei einer Lücke bleibt der Verbrauch sichtbar und der unbepreiste Zeitraum erkennbar. Eine Preisänderung löst keinen zweiten Bonus aus. |
| Bestandsdaten | Nach Migration sind Zählerstände, Vertragsdaten und gespeicherte Preiswerte erhalten. Erneuter Start erzeugt keine weiteren Verträge oder Preisabschnitte. Ungeklärte Gaseinheiten werden nicht still umgedeutet. |
| Erfassung unterwegs | Bei 360 und 390 Pixel Ansichtsbreite ohne Foto speichern. Beim Mehrfachscan den zweiten Upload fehlschlagen lassen und wiederholen: genau eine Ablesung je Foto und eine aktuelle Übersicht ohne Neuladen. |
| Bedienbarkeit | Vertragswechsel und manuelle Ablesung mit Bildschirmtastatur und bei 200 % Zoom abschließen. Browser-Zurück führt vom Detail zur Übersicht. `tests/test_ui.cjs` und `tests/test_contract_scanner.cjs` um Ergebnisprüfungen ergänzen; Screenshots allein reichen nicht. |

**Erste Auslieferungsgrenze:** Ein Nutzer kann im März einen Vertrag für April und bereits eine Preisänderung für Juli hinterlegen, erkennt auf dem Handy, was wann gilt, und erhält für März weiterhin dieselben historischen Kosten.
