; The Windows installer for Running Companion (Inno Setup 6). CI builds it for every release
; (.github/workflows/desktop.yml): deploy/windows/stage.sh prepares dist-desktop/app, Node's own node.exe goes in
; dist-desktop/node, then:  iscc /DAppVersion=0.3.0 deploy\windows\running-companion.iss
;
; Installs for the current user only (no administrator rights) into %LOCALAPPDATA%\Programs\Running Companion.
; The user's data is elsewhere (%LOCALAPPDATA%\Running Companion), so updating or uninstalling never touches it.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif

[Setup]
AppId={{6F1D2B7E-3C4A-4E8B-9A51-2D7C9E0B4F31}
AppName=Running Companion
AppVersion={#AppVersion}
AppVerName=Running Companion {#AppVersion}
AppPublisher=Dimitris Tsiakas
AppPublisherURL=https://github.com/Dtsiakas/running-companion
AppSupportURL=https://github.com/Dtsiakas/running-companion/issues
AppUpdatesURL=https://github.com/Dtsiakas/running-companion/releases
DefaultDirName={localappdata}\Programs\Running Companion
DisableProgramGroupPage=yes
DisableDirPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\dist-desktop
OutputBaseFilename=Running-Companion-Setup-{#AppVersion}
SetupIconFile=running-companion.ico
UninstallDisplayIcon={app}\running-companion.ico
UninstallDisplayName=Running Companion
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; An update while the app is open: ask to close it first rather than failing on files in use.
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; An update replaces the app's files entirely, so nothing from an older version lingers. Data isn't in here.
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "..\..\dist-desktop\node\node.exe"; DestDir: "{app}\node"; Flags: ignoreversion
Source: "..\..\dist-desktop\app\*"; DestDir: "{app}\app"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "running-companion.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Running Companion"; Filename: "{app}\node\node.exe"; \
  Parameters: "--disable-warning=ExperimentalWarning ""{app}\app\packages\cli\src\desktop.ts"""; \
  WorkingDir: "{app}\app"; IconFilename: "{app}\running-companion.ico"; \
  Comment: "Your Garmin running and health data. Close its window to turn it off."
Name: "{autoprograms}\Running Companion (new password)"; Filename: "{app}\node\node.exe"; \
  Parameters: "--disable-warning=ExperimentalWarning ""{app}\app\packages\cli\src\desktop.ts"" --set-password"; \
  WorkingDir: "{app}\app"; IconFilename: "{app}\running-companion.ico"; \
  Comment: "Forgot your password? Set a new one."
Name: "{autodesktop}\Running Companion"; Filename: "{app}\node\node.exe"; \
  Parameters: "--disable-warning=ExperimentalWarning ""{app}\app\packages\cli\src\desktop.ts"""; \
  WorkingDir: "{app}\app"; IconFilename: "{app}\running-companion.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\node\node.exe"; Parameters: "--disable-warning=ExperimentalWarning ""{app}\app\packages\cli\src\desktop.ts"""; \
  WorkingDir: "{app}\app"; Description: "Start Running Companion"; Flags: postinstall nowait skipifsilent

[UninstallDelete]
; Anything in the app folder the uninstaller didn't install itself (0.3.0 made links in node_modules on first start).
Type: filesandordirs; Name: "{app}\app"
