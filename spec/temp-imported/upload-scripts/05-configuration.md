# Upload Scripts Configuration

> **File:** `wp-plugins/scripts/wp-plugin-config.json`  
> **Status:** Not committed to git (contains credentials)

---

## Configuration Schema

```json
{
  "pluginFolderPath": "C:\\path\\to\\your\\plugin",
  "wordPressSiteURL": "https://your-site.com",
  "username": "admin",
  "appPassword": "xxxx xxxx xxxx xxxx",
  "pluginSlug": "my-plugin",
  "outputZipPath": "",
  "activateAfterInstall": true,
  "deleteZipAfterUpload": false
}
```

---

## Field Reference

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `pluginFolderPath` | String | **Yes** | — | Absolute path to the plugin source folder |
| `wordPressSiteURL` | String | **Yes** | — | WordPress site URL (trailing slash stripped automatically) |
| `username` | String | **Yes** | — | WordPress admin username |
| `appPassword` | String | **Yes** | — | WordPress Application Password (spaces auto-stripped) |
| `pluginSlug` | String | No | folder name | Override the plugin slug |
| `outputZipPath` | String | No | `$env:TEMP` | Custom path for the generated ZIP file |
| `activateAfterInstall` | Boolean | No | `false` | Activate the plugin after successful upload |
| `deleteZipAfterUpload` | Boolean | No | `false` | Delete the temp ZIP after upload |

---

## Security Notes

- **Never commit** `wp-plugin-config.json` to version control
- Application passwords should be generated per-user in WordPress Admin → Users → Application Passwords
- Application password spaces are automatically stripped before Base64 encoding

---

## Alternative Input Methods

### Inline JSON (via `-JsonConfig`)

```powershell
.\upload-plugin.ps1 -JsonConfig '{"pluginFolderPath":"C:\\path","wordPressSiteURL":"https://site.com","username":"admin","appPassword":"xxxx"}'
```

### Direct Parameters

```powershell
.\upload-plugin.ps1 -PluginPath "C:\path" -SiteUrl "https://site.com" -User "admin" -Password "xxxx"
```

### Priority Order

1. `-JsonConfig` (highest)
2. Direct command-line parameters
3. Config file (lowest)

---

*Configuration specification created: 2026-02-09*
