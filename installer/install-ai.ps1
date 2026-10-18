<#
    Growing Math - bootstrap da IA local (Ollama)

    Executado pelo instalador NSIS (macro customInstall) e tambem pelo atalho
    "Configurar IA local" do menu Iniciar, para o caso de a rede estar bloqueada
    no momento da instalacao.

    Responsabilidades:
      1. Instalar o Ollama (silencioso, por usuario, sem admin) se ainda nao existir.
      2. Garantir que o servico local esteja no ar em 127.0.0.1:11434.
      3. Baixar o modelo escolhido.
      4. Validar com uma geracao real e medir a latencia.
      5. Gravar o .env que o app le no boot.

    Nunca retorna codigo de erro: uma falha de rede degrada o app para o modo
    offline (exercicios prontos), mas jamais aborta a instalacao.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][string]$EnvPath,
    [string]$BaseUrl = "http://127.0.0.1:11434",
    [string]$SetupUrl = "https://ollama.com/download/OllamaSetup.exe",
    [switch]$SkipInstall,
    # Forca o caminho degradado mesmo em FullLanguage. Serve para validar o
    # comportamento em maquinas com WDAC restritivo sem precisar de uma.
    [switch]$ForceRestrictedMode
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$LogDir = Join-Path $env:LOCALAPPDATA "GrowingMath"
$LogPath = Join-Path $LogDir "install-ai.log"
if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

# Politicas WDAC/AppLocker colocam o PowerShell em ConstrainedLanguage, onde
# Add-Type, New-Object e chamadas de metodo em tipos fora da allowlist (.NET
# HttpClient, [Console], [System.Net.WebRequest]) lancam excecao. Cada caminho
# que depende disso tem um equivalente feito so com cmdlets, que continuam
# liberados. Sem isso o bootstrap morreria na primeira linha em maquinas com a
# politica mais restritiva.
$script:ConstrainedMode = $false
try {
    $script:ConstrainedMode = ($ExecutionContext.SessionState.LanguageMode -ne "FullLanguage")
} catch { $script:ConstrainedMode = $true }
if ($ForceRestrictedMode) { $script:ConstrainedMode = $true }

function Write-Stage {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    # Nao usar Write-Output: qualquer coisa emitida no pipeline dentro de uma
    # funcao vira parte do VALOR DE RETORNO dela, o que transformava retornos
    # booleanos em arrays. [Console] e Write-Host escrevem fora do pipeline.
    if ($script:ConstrainedMode) {
        Write-Host $line
    } else {
        [Console]::Out.WriteLine($line)
        [Console]::Out.Flush()
    }
    try { Add-Content -Path $LogPath -Value $line -Encoding UTF8 } catch { }
}

# Escreve o .env lido por electron/main.mjs (candidato 1: ao lado do executavel).
# Sempre gravado, mesmo em falha, para que o app tenha um estado explicito.
function Write-EnvFile {
    param([string]$Provider, [string]$ModelName)

    # Os parenteses sao obrigatorios: em array literal a virgula tem precedencia
    # maior que o "+", entao "# " + (Get-Date) viraria dois elementos separados.
    $lines = @(
        "# Gerado automaticamente pelo instalador do Growing Math",
        ("# " + (Get-Date -Format "yyyy-MM-dd HH:mm:ss")),
        "AI_PROVIDER=$Provider",
        "OLLAMA_BASE_URL=$BaseUrl"
    )
    if ($ModelName) { $lines += "OLLAMA_MODEL=$ModelName" }

    try {
        $dir = Split-Path -Parent $EnvPath
        if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        # ASCII evita BOM, que o dotenv interpretaria como parte da primeira chave.
        Set-Content -Path $EnvPath -Value ($lines -join "`r`n") -Encoding ASCII -Force
        Write-Stage "Configuracao gravada em $EnvPath (AI_PROVIDER=$Provider)"
    } catch {
        Write-Stage "AVISO: nao foi possivel gravar $EnvPath - $($_.Exception.Message)"
    }
}

function Set-NetworkDefaults {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    } catch { }
    try {
        # Rede corporativa: o proxy precisa das credenciais do usuario logado.
        $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
        $proxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
        [System.Net.WebRequest]::DefaultWebProxy = $proxy
    } catch { }
}

# O Ollama e escrito em Go, e o Go IGNORA o proxy configurado no Windows: ele so
# le HTTP_PROXY/HTTPS_PROXY. Sem propagar isso, o download do modelo trava em
# "pulling manifest" em qualquer maquina atras de proxy corporativo.
function Sync-ProxyEnvironment {
    if ($env:HTTPS_PROXY -or $env:HTTP_PROXY) {
        Write-Stage "Proxy ja definido no ambiente: $($env:HTTPS_PROXY)$($env:HTTP_PROXY)"
        return $true
    }

    $proxyUrl = $null
    if ($script:ConstrainedMode) {
        $proxyUrl = Get-ProxyFromRegistry
        if (-not $proxyUrl) { $proxyUrl = Get-ProxyFromPac }
    } else {
        try {
            $systemProxy = [System.Net.WebRequest]::GetSystemWebProxy()
            $resolved = $systemProxy.GetProxy("https://registry.ollama.ai")
            if ($resolved -and $resolved.AbsoluteUri -notmatch "registry\.ollama\.ai") {
                $proxyUrl = $resolved.AbsoluteUri.TrimEnd("/")
            }
        } catch { }
        # PAC que nao resolveu pelo .NET ou falha na chamada: tenta pelo registro.
        if (-not $proxyUrl) { $proxyUrl = Get-ProxyFromRegistry }
        if (-not $proxyUrl) { $proxyUrl = Get-ProxyFromPac }
    }

    if (-not $proxyUrl) {
        Write-Stage "Nenhum proxy detectado: conexao direta."
        return $false
    }

    Write-Stage "Proxy do Windows detectado: $proxyUrl (propagando para o Ollama)"

    foreach ($name in @("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy")) {
        Set-Item -Path "Env:$name" -Value $proxyUrl
    }
    $env:NO_PROXY = "127.0.0.1,localhost"

    # Escopo de usuario: o tray do Ollama sobe pelo autostart do Windows e
    # precisa enxergar o proxy tambem depois de reiniciar a maquina.
    try {
        if ($script:ConstrainedMode) {
            # [Environment] nao esta na allowlist do ConstrainedLanguage; gravar
            # em HKCU:\Environment tem o mesmo efeito de escopo "User".
            Set-ItemProperty -Path "HKCU:\Environment" -Name "HTTPS_PROXY" -Value $proxyUrl -Force
            Set-ItemProperty -Path "HKCU:\Environment" -Name "HTTP_PROXY" -Value $proxyUrl -Force
            Set-ItemProperty -Path "HKCU:\Environment" -Name "NO_PROXY" -Value "127.0.0.1,localhost" -Force
        } else {
            [Environment]::SetEnvironmentVariable("HTTPS_PROXY", $proxyUrl, "User")
            [Environment]::SetEnvironmentVariable("HTTP_PROXY", $proxyUrl, "User")
            [Environment]::SetEnvironmentVariable("NO_PROXY", "127.0.0.1,localhost", "User")
        }
    } catch {
        Write-Stage "AVISO: nao foi possivel persistir o proxy no perfil do usuario."
    }

    return $true
}

# Le o proxy direto do registro do Internet Explorer/WinINET, que e a mesma
# fonte que GetSystemWebProxy() consulta. Usado quando o ConstrainedLanguage
# bloqueia a chamada .NET.
function Get-ProxyFromRegistry {
    try {
        $key = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -ErrorAction Stop
        if (-not $key.ProxyEnable -or $key.ProxyEnable -eq 0) { return $null }

        $server = [string]$key.ProxyServer
        if (-not $server) { return $null }

        # O valor pode ser "host:porta" ou "http=host:porta;https=host:porta".
        if ($server -match "(?:^|;)\s*https?=([^;]+)") {
            $server = $Matches[1]
        } elseif ($server -match ";") {
            return $null
        }

        $server = $server.Trim()
        if ($server -notmatch "^https?://") { $server = "http://$server" }
        return $server.TrimEnd("/")
    } catch {
        return $null
    }
}

# Redes corporativas costumam usar PAC (um script JavaScript) em vez de proxy
# fixo - e o caso da Deere. Em FullLanguage o .NET avalia o PAC sozinho, mas em
# ConstrainedLanguage isso e bloqueado. Aqui o PAC e baixado como texto e os
# literais "PROXY host:porta" sao extraidos e testados um a um: sem avaliar o
# JavaScript, mas cobrindo o formato usado por praticamente todo PAC corporativo.
function Get-ProxyFromPac {
    $pacUrl = $null
    try {
        $key = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings" -ErrorAction Stop
        $pacUrl = [string]$key.AutoConfigURL
    } catch { }
    if (-not $pacUrl) { return $null }

    Write-Stage "Proxy definido por script PAC: $pacUrl"

    $text = $null
    try {
        $text = [string](Invoke-WebRequest -Uri $pacUrl -UseBasicParsing -TimeoutSec 20).Content
    } catch {
        Write-Stage "AVISO: nao foi possivel baixar o PAC - $($_.Exception.Message)"
        return $null
    }

    $candidates = @()
    try {
        $found = $text | Select-String -Pattern "PROXY\s+([A-Za-z0-9\.\-]+:\d+)" -AllMatches
        $candidates = @($found.Matches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
    } catch { }

    if ($candidates.Count -eq 0) {
        Write-Stage "AVISO: nenhum proxy literal encontrado no PAC."
        return $null
    }

    # O PAC tem varias ramificacoes (intranet, DMZ, internet); so serve o proxy
    # que realmente alcanca o registro de modelos do Ollama. O alvo e um
    # manifesto real porque "/v2/" responde 404 ate quando o proxy funciona, o
    # que tornaria qualquer pagina de erro do proxy um falso positivo.
    $probeUrl = "https://registry.ollama.ai/v2/library/qwen2.5/manifests/0.5b"
    foreach ($candidate in ($candidates | Select-Object -First 6)) {
        $url = "http://$candidate"
        try {
            $probe = Invoke-WebRequest -Uri $probeUrl -Proxy $url -ProxyUseDefaultCredentials `
                -UseBasicParsing -TimeoutSec 15
            if ([int]$probe.StatusCode -eq 200) {
                Write-Stage "Proxy do PAC validado: $url"
                return $url
            }
        } catch { }
    }

    Write-Stage "AVISO: nenhum proxy do PAC conseguiu alcancar o registro do Ollama."
    return $null
}

function Test-OllamaApi {    param([int]$TimeoutSec = 3)
    try {
        Invoke-RestMethod -Uri "$BaseUrl/api/tags" -TimeoutSec $TimeoutSec -UseBasicParsing | Out-Null
        return $true
    } catch {
        return $false
    }
}

function Get-OllamaExe {
    $candidates = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"),
        (Join-Path $env:ProgramFiles "Ollama\ollama.exe")
    )
    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) { return $candidate }
    }
    $cmd = Get-Command ollama -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

# Download manual em blocos: Invoke-WebRequest manda o progresso para um stream
# que o log do NSIS nao captura, entao o percentual e impresso em stdout.
function Get-FileWithProgress {
    param([string]$Url, [string]$Destination)

    if ($script:ConstrainedMode) {
        # Sem HttpClient nao ha como reportar percentual, mas Invoke-WebRequest
        # baixa o arquivo igual. O usuario ve apenas "aguarde".
        Write-Stage "  baixando (modo restrito, sem indicador de progresso)..."
        Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing -TimeoutSec 7200
        return
    }

    Add-Type -AssemblyName System.Net.Http | Out-Null

    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.UseDefaultCredentials = $true
    try { $handler.Proxy = [System.Net.WebRequest]::DefaultWebProxy } catch { }

    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromHours(2)

    $stream = $null
    $output = $null
    $response = $null

    try {
        $response = $client.GetAsync($Url, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "HTTP $([int]$response.StatusCode) ao baixar $Url"
        }

        $total = $response.Content.Headers.ContentLength
        $totalMb = if ($total) { [math]::Round($total / 1MB, 1) } else { 0 }

        $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $output = [System.IO.File]::Create($Destination)

        $buffer = New-Object byte[] 1048576
        $readTotal = [int64]0
        $lastReport = -1

        while ($true) {
            $read = $stream.Read($buffer, 0, $buffer.Length)
            if ($read -le 0) { break }
            $output.Write($buffer, 0, $read)
            $readTotal += $read

            if ($total -and $total -gt 0) {
                $percent = [int](($readTotal / $total) * 100)
                if ($percent -ge ($lastReport + 5)) {
                    $lastReport = $percent
                    Write-Stage ("  download {0}% ({1} MB de {2} MB)" -f $percent, [math]::Round($readTotal / 1MB, 1), $totalMb)
                }
            }
        }
    } finally {
        if ($output) { $output.Dispose() }
        if ($stream) { $stream.Dispose() }
        if ($response) { $response.Dispose() }
        $client.Dispose()
    }
}

function Install-Ollama {
    $setupPath = Join-Path $env:TEMP "OllamaSetup-GrowingMath.exe"

    Write-Stage "Baixando o instalador do Ollama (aprox. 1,5 GB)..."
    Get-FileWithProgress -Url $SetupUrl -Destination $setupPath

    $sizeMb = [math]::Round((Get-Item $setupPath).Length / 1MB, 1)
    if ($sizeMb -lt 100) {
        throw "Download invalido: apenas $sizeMb MB. A rede provavelmente bloqueou o arquivo."
    }
    Write-Stage "Download concluido ($sizeMb MB). Instalando em modo silencioso..."

    # OllamaSetup.exe e um instalador Inno Setup: instala por usuario, sem admin.
    $proc = Start-Process -FilePath $setupPath -ArgumentList "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART" -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        throw "O instalador do Ollama retornou codigo $($proc.ExitCode)."
    }

    Write-Stage "Ollama instalado."
    Remove-Item $setupPath -Force -ErrorAction SilentlyContinue
}

function Stop-OllamaProcesses {
    foreach ($name in @("ollama app", "ollama")) {
        foreach ($proc in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
            try {
                Stop-Process -Id $proc.Id -Force -ErrorAction Stop
                Write-Stage "  processo $name (PID $($proc.Id)) encerrado."
            } catch { }
        }
    }
    Start-Sleep -Seconds 2
}

function Start-OllamaService {
    param([string]$ExePath, [switch]$Force)

    if ($Force) {
        # O servidor so enxerga o proxy se for iniciado DEPOIS das variaveis
        # estarem no ambiente; um processo ja em execucao precisa reiniciar.
        Write-Stage "Reiniciando o Ollama para aplicar as variaveis de rede..."
        Stop-OllamaProcesses
    } elseif (Test-OllamaApi) {
        Write-Stage "Servico Ollama ja esta no ar."
        return $true
    }

    # "ollama app.exe" e o tray: sobe o servidor E registra o autostart do Windows,
    # garantindo que a IA continue disponivel depois de reiniciar a maquina.
    $trayPath = Join-Path (Split-Path -Parent $ExePath) "ollama app.exe"
    if (Test-Path $trayPath) {
        Write-Stage "Iniciando o Ollama (com autostart)..."
        Start-Process -FilePath $trayPath -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
    } else {
        Write-Stage "Iniciando 'ollama serve'..."
        Start-Process -FilePath $ExePath -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
    }

    for ($i = 0; $i -lt 45; $i++) {
        Start-Sleep -Seconds 2
        if (Test-OllamaApi) {
            Write-Stage "Servico Ollama respondendo em $BaseUrl."
            return $true
        }
    }

    return $false
}

function Install-Model {
    param([string]$Name)

    $existing = @()
    try {
        $tags = Invoke-RestMethod -Uri "$BaseUrl/api/tags" -TimeoutSec 10 -UseBasicParsing
        $existing = @($tags.models | ForEach-Object { $_.name })
    } catch { }

    if ($existing -contains $Name) {
        Write-Stage "Modelo $Name ja esta instalado."
        return
    }

    Write-Stage "Baixando o modelo $Name (pode levar varios minutos)..."

    if ($script:ConstrainedMode) {
        # stream=false faz a API segurar a resposta ate o fim do download e
        # devolver um unico JSON, evitando o HttpClient necessario para ler
        # NDJSON incremental. Perde-se o progresso, nao a funcionalidade.
        Write-Stage "  modo restrito: download sem indicador de progresso, aguarde."
        $pullBody = (@{ name = $Name; stream = $false } | ConvertTo-Json -Compress)
        $pullResult = Invoke-RestMethod -Uri "$BaseUrl/api/pull" -Method Post -Body $pullBody `
            -ContentType "application/json" -TimeoutSec 10800 -UseBasicParsing
        if ($pullResult.error) {
            throw "Falha ao baixar o modelo: $($pullResult.error)"
        }
    } else {
        Install-ModelStreaming -Name $Name
    }

    # A API pode encerrar o stream sem erro explicito; confirma pela lista.
    $confirmed = @()
    try {
        $tags = Invoke-RestMethod -Uri "$BaseUrl/api/tags" -TimeoutSec 15 -UseBasicParsing
        $confirmed = @($tags.models | ForEach-Object { $_.name })
    } catch { }

    if ($confirmed -notcontains $Name) {
        throw "O modelo $Name nao aparece na lista do Ollama apos o download."
    }

    Write-Stage "Modelo $Name instalado."
}

function Install-ModelStreaming {
    param([string]$Name)

    # Usa a API HTTP em vez do "ollama pull": o CLI escreve spinners ANSI em
    # stderr, que com ErrorActionPreference=Stop viram excecao, e o progresso
    # com \r polui o log do instalador. A API devolve NDJSON estruturado.
    Add-Type -AssemblyName System.Net.Http | Out-Null
    # UseProxy=$false: a chamada e para 127.0.0.1 e nao pode passar pelo proxy
    # corporativo que acabamos de configurar no ambiente.
    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $client = New-Object System.Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromHours(3)

    $payload = (@{ name = $Name; stream = $true } | ConvertTo-Json -Compress)
    $content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")

    $response = $null
    $stream = $null
    $reader = $null
    $lastPercent = -1
    $lastStatus = ""
    $failure = $null

    try {
        # PostAsync nao tem sobrecarga com HttpCompletionOption; para ler o NDJSON
        # conforme chega (em vez de bufferizar tudo) e preciso usar SendAsync.
        $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::Post, "$BaseUrl/api/pull")
        $request.Content = $content
        $response = $client.SendAsync($request, [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) {
            throw "HTTP $([int]$response.StatusCode) em /api/pull."
        }

        $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $reader = New-Object System.IO.StreamReader($stream)

        while (-not $reader.EndOfStream) {
            $line = $reader.ReadLine()
            if (-not $line) { continue }

            $evt = $null
            try { $evt = $line | ConvertFrom-Json } catch { continue }

            if ($evt.error) {
                $failure = [string]$evt.error
                break
            }

            $status = [string]$evt.status
            if ($evt.total -and $evt.total -gt 0) {
                $percent = [int](($evt.completed / $evt.total) * 100)
                if ($percent -ge ($lastPercent + 5) -or $status -ne $lastStatus) {
                    $lastPercent = $percent
                    $lastStatus = $status
                    Write-Stage ("  {0} {1}% ({2} MB de {3} MB)" -f $status, $percent, [math]::Round($evt.completed / 1MB, 1), [math]::Round($evt.total / 1MB, 1))
                }
            } elseif ($status -and $status -ne $lastStatus) {
                $lastStatus = $status
                $lastPercent = -1
                Write-Stage "  $status"
            }
        }
    } finally {
        if ($reader) { $reader.Dispose() }
        if ($stream) { $stream.Dispose() }
        if ($response) { $response.Dispose() }
        $client.Dispose()
    }

    if ($failure) {
        throw "Falha ao baixar o modelo: $failure"
    }
}

# Geracao real de ponta a ponta: e o unico teste que prova que o app vai funcionar.
function Test-ModelGeneration {
    param([string]$Name)

    Write-Stage "Validando o modelo com uma geracao real..."
    $body = @{
        model    = $Name
        stream   = $false
        messages = @(
            @{ role = "user"; content = "Responda apenas com o numero: quanto e 12 + 7?" }
        )
        options  = @{ temperature = 0 }
    } | ConvertTo-Json -Depth 6 -Compress

    $started = Get-Date
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/chat" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 600 -UseBasicParsing
    $elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)

    $content = [string]$response.message.content
    if (-not $content.Trim()) {
        throw "O modelo respondeu vazio."
    }

    Write-Stage "Modelo respondeu em ${elapsed}s."
    if ($content -match "19") {
        Write-Stage "Teste de matematica correto."
    } else {
        Write-Stage "AVISO: a resposta do teste nao continha '19'. O modelo funciona, mas pode errar contas."
    }

    return $elapsed
}

# ---------------------------------------------------------------- execucao

Write-Stage "=== Configuracao da IA local do Growing Math ==="
Write-Stage "Modelo solicitado: $Model"
if ($script:ConstrainedMode) {
    Write-Stage "PowerShell em modo restrito (politica WDAC/AppLocker): usando caminho degradado."
}

try {
    Set-NetworkDefaults
    $proxyApplied = Sync-ProxyEnvironment

    $exe = Get-OllamaExe
    if (-not $exe) {
        if ($SkipInstall) { throw "Ollama nao encontrado e a instalacao foi desabilitada." }
        Install-Ollama
        $exe = Get-OllamaExe
    } else {
        Write-Stage "Ollama ja instalado em $exe"
    }

    if (-not $exe) {
        throw "Ollama nao foi localizado apos a instalacao."
    }

    # Com proxy, forca o restart para que o servidor herde HTTPS_PROXY.
    if (-not (Start-OllamaService -ExePath $exe -Force:$proxyApplied)) {
        throw "O servico do Ollama nao respondeu em $BaseUrl apos 90 segundos."
    }

    Install-Model -Name $Model
    $elapsed = Test-ModelGeneration -Name $Model

    Write-EnvFile -Provider "ollama" -ModelName $Model

    Write-Stage "=== IA local pronta para uso (latencia do teste: ${elapsed}s) ==="
    exit 0
} catch {
    Write-Stage "FALHA: $($_.Exception.Message)"
    Write-Stage "O Growing Math sera instalado em modo offline (exercicios prontos, sem IA)."
    Write-Stage "Use o atalho 'Configurar IA local' no menu Iniciar para tentar novamente."
    Write-EnvFile -Provider "auto" -ModelName $null
    # Sai com 0 de proposito: falta de IA nao pode quebrar a instalacao do app.
    exit 0
}
