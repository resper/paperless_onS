# Quick Start Guide

## Installation und Einrichtung

### 1. Virtuelle Umgebung erstellen

```bash
python -m venv venv
source venv/bin/activate  # Linux/Mac
# oder: venv\Scripts\activate  # Windows
```

### 2. Abhängigkeiten installieren

```bash
pip install -r requirements.txt
```

### 3. Umgebungsvariablen konfigurieren (optional)

```bash
cp .env.example .env
# Bearbeiten Sie .env nach Bedarf
```

### 4. Datenbank initialisieren

```bash
python -m backend.database.init_db
```

### 5. Anwendung starten

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 6. Web-Interface öffnen

Öffnen Sie Ihren Browser und navigieren Sie zu:
```
http://localhost:8000/app
```

## Erste Schritte

### 1. API-Konfiguration

1. Klicken Sie auf **"Settings"** in der Seitenleiste
2. Geben Sie Ihre Zugangsdaten ein:
   - **Paperless-NGX URL**: z.B. `http://localhost:8000`
   - **Paperless API Token**: Ihr Token aus Paperless-NGX Settings
   - **OpenAI API Key**: Ihr OpenAI API-Schlüssel
3. Klicken Sie auf **"Save Settings"**
4. Klicken Sie auf **"Test Connections"** um die Verbindungen zu testen

### 2. Dokumente analysieren

1. Klicken Sie auf **"Documents"** in der Seitenleiste
2. Wählen Sie ein **Tag** aus dem Dropdown-Menü
3. Die Dokumente mit diesem Tag werden aufgelistet
4. Klicken Sie auf **"Analyze"** bei einem Dokument
5. Warten Sie auf die AI-Analyse
6. Überprüfen Sie die vorgeschlagenen Metadaten
7. Klicken Sie auf **"Apply Metadata to Paperless"** um die Änderungen zu übernehmen

### 3. Verlauf anzeigen

Klicken Sie auf **"Processing History"** um alle verarbeiteten Dokumente anzuzeigen.

## API-Dokumentation

Die interaktive API-Dokumentation finden Sie unter:
```
http://localhost:8000/docs
```

## Wichtige Endpunkte

- **Web-Interface**: `http://localhost:8000/app`
- **API-Dokumentation**: `http://localhost:8000/docs`
- **Health Check**: `http://localhost:8000/health`
- **API Root**: `http://localhost:8000/`

## Fehlerbehebung

### "Paperless-NGX not configured"
- Stellen Sie sicher, dass Sie die Paperless-URL und das Token in den Settings eingegeben haben
- Testen Sie die Verbindung mit "Test Connections"

### "Missing required settings"
- Führen Sie `python -m backend.database.init_db` aus, um die Datenbank zu initialisieren

### Verbindungsfehler
- Überprüfen Sie, dass Paperless-NGX erreichbar ist
- Überprüfen Sie, dass der API-Token korrekt ist
- Überprüfen Sie Ihre Firewall-Einstellungen

## Produktions-Deployment

Für den Produktionseinsatz:

1. Setzen Sie `DEBUG=false` in `.env`
2. Ändern Sie `SECRET_KEY` zu einem sicheren Wert
3. Verwenden Sie einen Reverse Proxy (nginx, Caddy)
4. Verwenden Sie HTTPS
5. Setzen Sie passende Umgebungsvariablen für API-Tokens

Beispiel mit gunicorn:
```bash
pip install gunicorn
gunicorn backend.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

## Support

Bei Problemen oder Fragen öffnen Sie bitte ein Issue im Repository.
