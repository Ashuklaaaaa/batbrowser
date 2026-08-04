# ═══════════════════════════════════════════════════════════════
# BatBrowser X — Windows Setup Executable Builder
# Compiles a native Windows GUI Installer (BatBrowser-Setup.exe)
# ═══════════════════════════════════════════════════════════════

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputFile  = Join-Path $ProjectRoot "BatBrowser-Setup.exe"
$BuildOutput = Join-Path $ProjectRoot "build\installer\BatBrowser-Setup.exe"

Write-Host "Compiling BatBrowser Native Windows Setup Executable..." -ForegroundColor Cyan

$code = @'
using System;
using System.IO;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace BatBrowserInstaller {
    public class SetupForm : Form {
        private ProgressBar progressBar;
        private Label lblStatus;
        private Label lblTitle;
        private Label lblSubtitle;
        private Button btnInstall;
        private Button btnCancel;
        private CheckBox chkLaunch;
        private BackgroundWorker worker;
        private string targetDir;

        public SetupForm() {
            InitializeUI();
            targetDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "BatBrowser");
        }

        private void InitializeUI() {
            this.Text = "BatBrowser X Setup";
            this.Size = new Size(540, 360);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.BackColor = Color.FromArgb(8, 10, 15); // NOCTURNE Abyss
            this.ForeColor = Color.FromArgb(240, 244, 248);

            // Title
            lblTitle = new Label();
            lblTitle.Text = "BatBrowser X Setup";
            lblTitle.Font = new Font("Segoe UI", 18, FontStyle.Bold);
            lblTitle.ForeColor = Color.FromArgb(0, 212, 180); // NOCTURNE Teal
            lblTitle.Location = new Point(30, 24);
            lblTitle.AutoSize = true;
            this.Controls.Add(lblTitle);

            // Subtitle
            lblSubtitle = new Label();
            lblSubtitle.Text = "Click Install Now to install BatBrowser and create desktop shortcuts.";
            lblSubtitle.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            lblSubtitle.ForeColor = Color.FromArgb(110, 120, 137);
            lblSubtitle.Location = new Point(32, 60);
            lblSubtitle.Size = new Size(460, 40);
            this.Controls.Add(lblSubtitle);

            // Progress Bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(32, 130);
            progressBar.Size = new Size(460, 22);
            progressBar.Style = ProgressBarStyle.Continuous;
            this.Controls.Add(progressBar);

            // Status Label
            lblStatus = new Label();
            lblStatus.Text = "Ready to install.";
            lblStatus.Font = new Font("Segoe UI", 9, FontStyle.Regular);
            lblStatus.ForeColor = Color.FromArgb(180, 190, 205);
            lblStatus.Location = new Point(32, 160);
            lblStatus.Size = new Size(460, 30);
            this.Controls.Add(lblStatus);

            // Checkbox Launch
            chkLaunch = new CheckBox();
            chkLaunch.Text = "Launch BatBrowser when setup finishes";
            chkLaunch.Font = new Font("Segoe UI", 9.5f);
            chkLaunch.Checked = true;
            chkLaunch.Location = new Point(32, 205);
            chkLaunch.AutoSize = true;
            this.Controls.Add(chkLaunch);

            // Install Button
            btnInstall = new Button();
            btnInstall.Text = "Install Now";
            btnInstall.Font = new Font("Segoe UI", 10, FontStyle.Bold);
            btnInstall.BackColor = Color.FromArgb(0, 212, 180);
            btnInstall.ForeColor = Color.Black;
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Location = new Point(280, 260);
            btnInstall.Size = new Size(110, 36);
            btnInstall.Click += BtnInstall_Click;
            this.Controls.Add(btnInstall);

            // Cancel Button
            btnCancel = new Button();
            btnCancel.Text = "Cancel";
            btnCancel.Font = new Font("Segoe UI", 10, FontStyle.Regular);
            btnCancel.BackColor = Color.FromArgb(26, 29, 36);
            btnCancel.ForeColor = Color.White;
            btnCancel.FlatStyle = FlatStyle.Flat;
            btnCancel.FlatAppearance.BorderSize = 0;
            btnCancel.Location = new Point(400, 260);
            btnCancel.Size = new Size(90, 36);
            btnCancel.Click += (s, e) => this.Close();
            this.Controls.Add(btnCancel);

            // BackgroundWorker
            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork += Worker_DoWork;
            worker.ProgressChanged += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;
        }

        private void BtnInstall_Click(object sender, EventArgs e) {
            btnInstall.Enabled = false;
            btnCancel.Enabled = false;
            lblSubtitle.Text = "Installing BatBrowser into: " + targetDir;
            worker.RunWorkerAsync();
        }

        private void Worker_DoWork(object sender, DoWorkEventArgs e) {
            try {
                worker.ReportProgress(10, "Creating installation directories...");
                if (!Directory.Exists(targetDir)) {
                    Directory.CreateDirectory(targetDir);
                }

                string sourceDir = AppDomain.CurrentDomain.BaseDirectory;
                string[] dirsToCopy = new string[] { "src", "ui", "preload", "assets", "resources", "electron-bin" };
                string[] filesToCopy = new string[] { "main.js", "package.json", "Start-BatBrowser.bat" };

                int totalItems = dirsToCopy.Length + filesToCopy.Length;
                int current = 0;

                foreach (string f in filesToCopy) {
                    string srcFile = Path.Combine(sourceDir, f);
                    if (File.Exists(srcFile)) {
                        File.Copy(srcFile, Path.Combine(targetDir, f), true);
                    }
                    current++;
                    worker.ReportProgress(10 + (current * 70 / totalItems), "Copying " + f + "...");
                }

                foreach (string d in dirsToCopy) {
                    string srcSub = Path.Combine(sourceDir, d);
                    if (Directory.Exists(srcSub)) {
                        CopyDirectory(srcSub, Path.Combine(targetDir, d));
                    }
                    current++;
                    worker.ReportProgress(10 + (current * 70 / totalItems), "Installing " + d + " component...");
                }

                worker.ReportProgress(85, "Creating Desktop and Start Menu Shortcuts...");
                CreateDesktopShortcut(targetDir);

                worker.ReportProgress(100, "Installation Complete!");
            } catch (Exception ex) {
                e.Result = ex;
            }
        }

        private void CopyDirectory(string source, string destination) {
            Directory.CreateDirectory(destination);
            foreach (string file in Directory.GetFiles(source)) {
                string destFile = Path.Combine(destination, Path.GetFileName(file));
                File.Copy(file, destFile, true);
            }
            foreach (string sub in Directory.GetDirectories(source)) {
                string destSub = Path.Combine(destination, Path.GetFileName(sub));
                CopyDirectory(sub, destSub);
            }
        }

        private void CreateDesktopShortcut(string appFolder) {
            try {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string shortcutPath = Path.Combine(desktop, "BatBrowser.lnk");
                string launcherBat = Path.Combine(appFolder, "Start-BatBrowser.bat");

                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = launcherBat;
                shortcut.WorkingDirectory = appFolder;
                shortcut.Description = "Launch BatBrowser X";
                shortcut.Save();

                string startMenu = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "BatBrowser.lnk");
                dynamic smShortcut = shell.CreateShortcut(startMenu);
                smShortcut.TargetPath = launcherBat;
                smShortcut.WorkingDirectory = appFolder;
                smShortcut.Description = "Launch BatBrowser X";
                smShortcut.Save();
            } catch {}
        }

        private void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e) {
            progressBar.Value = Math.Min(e.ProgressPercentage, 100);
            lblStatus.Text = e.UserState as string;
        }

        private void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e) {
            if (e.Result is Exception) {
                Exception ex = (Exception)e.Result;
                MessageBox.Show("Installation failed: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnInstall.Enabled = true;
                btnCancel.Enabled = true;
            } else {
                lblTitle.Text = "BatBrowser Installed!";
                lblStatus.Text = "BatBrowser has been installed successfully.";
                btnCancel.Text = "Close";
                btnCancel.Enabled = true;
                btnInstall.Text = "Finished";
                btnInstall.Enabled = true;
                btnInstall.Click -= BtnInstall_Click;
                btnInstall.Click += (s, args) => {
                    if (chkLaunch.Checked) {
                        Process.Start(Path.Combine(targetDir, "Start-BatBrowser.bat"));
                    }
                    this.Close();
                };
            }
        }

        [STAThread]
        public static void Main() {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
'@

Add-Type -TypeDefinition $code -ReferencedAssemblies "System.Windows.Forms", "System.Drawing", "Microsoft.CSharp" -OutputAssembly $OutputFile -OutputType WindowsApplication

if (Test-Path $OutputFile) {
    Copy-Item $OutputFile $BuildOutput -Force
    Write-Host "Setup Executable compiled successfully: BatBrowser-Setup.exe" -ForegroundColor Green
} else {
    Write-Host "Compilation failed." -ForegroundColor Red
}
