; ============================================================================
;  Growing Math - customizacao do instalador NSIS
;
;  Adiciona uma pagina de escolha do modelo de IA local e dispara o bootstrap
;  do Ollama (installer/install-ai.ps1) durante a instalacao, de modo que o app
;  ja esteja funcional com IA assim que o instalador terminar.
;
;  Macros usados (electron-builder 25):
;    customHeader            -> declaracao de variaveis e funcoes de pagina
;    customPageAfterChangeDir-> insere a pagina apos a escolha do diretorio
;    customInstall           -> roda depois de extrair os arquivos
;    customUnInstall         -> limpeza na desinstalacao
; ============================================================================

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!ifndef WS_GROUP
  !define WS_GROUP 0x00020000
!endif

!macro customHeader
  ; O mesmo script e compilado uma segunda vez para gerar o desinstalador. Nessa
  ; passagem nem a pagina nem o customInstall existem, e funcoes/variaveis sem
  ; referencia viram "warning 6001/6010" - que o electron-builder trata como erro.
  !ifndef BUILD_UNINSTALLER

  Var GmModel
  Var GmDialog
  Var GmIntroLabel
  Var GmRadioQwen3b
  Var GmRadioQwen7b
  Var GmRadioLlama8b
  Var GmRadioSkip
  Var GmFootLabel

  Function GmAiPageCreate
    !insertmacro MUI_HEADER_TEXT "Inteligencia artificial local" "Escolha o modelo que sera instalado junto com o Growing Math."

    nsDialogs::Create 1018
    Pop $GmDialog
    ${If} $GmDialog == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 34u "O Growing Math usa um modelo de IA local (Ollama) para gerar exercicios e responder duvidas sem enviar nenhum dado para a internet.$\r$\n$\r$\nO instalador vai baixar o Ollama (aprox. 1,5 GB) e o modelo escolhido. E necessario ter conexao liberada agora."
    Pop $GmIntroLabel

    ${NSD_CreateRadioButton} 0 40u 100% 12u "Qwen 2.5 3B - recomendado (aprox. 2 GB, rapido em computador sem placa de video)"
    Pop $GmRadioQwen3b
    ${NSD_AddStyle} $GmRadioQwen3b ${WS_GROUP}

    ${NSD_CreateRadioButton} 0 54u 100% 12u "Qwen 2.5 7B - melhor qualidade em matematica (aprox. 4,7 GB)"
    Pop $GmRadioQwen7b

    ${NSD_CreateRadioButton} 0 68u 100% 12u "Llama 3.1 8B - padrao do time (aprox. 4,7 GB, mais lento sem placa de video)"
    Pop $GmRadioLlama8b

    ${NSD_CreateRadioButton} 0 82u 100% 12u "Nao instalar agora - o app funciona em modo offline, com exercicios prontos"
    Pop $GmRadioSkip

    ${NSD_CreateLabel} 0 100u 100% 32u "O download acontece durante a instalacao e pode levar varios minutos.$\r$\nSe a rede bloquear o download, o app sera instalado em modo offline e voce podera tentar de novo pelo atalho 'Growing Math - Configurar IA local' no menu Iniciar."
    Pop $GmFootLabel

    ${NSD_Check} $GmRadioQwen3b

    nsDialogs::Show
  FunctionEnd

  Function GmAiPageLeave
    StrCpy $GmModel ""

    ${NSD_GetState} $GmRadioQwen3b $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $GmModel "qwen2.5:3b"
    ${EndIf}

    ${NSD_GetState} $GmRadioQwen7b $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $GmModel "qwen2.5:7b"
    ${EndIf}

    ${NSD_GetState} $GmRadioLlama8b $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $GmModel "llama3.1:8b"
    ${EndIf}
  FunctionEnd

  !endif ; BUILD_UNINSTALLER
!macroend

!macro customPageAfterChangeDir
  Page custom GmAiPageCreate GmAiPageLeave
!macroend

!macro customInstall
  ; Atalho de reexecucao: essencial quando o proxy corporativo bloqueia o
  ; download no momento da instalacao.
  StrCpy $1 $GmModel
  ${If} $1 == ""
    StrCpy $1 "qwen2.5:3b"
  ${EndIf}

  FileOpen $2 "$INSTDIR\configurar-ia.cmd" w
  FileWrite $2 "@echo off$\r$\n"
  FileWrite $2 "title Growing Math - Configurar IA local$\r$\n"
  FileWrite $2 "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $\"%~dp0resources\install-ai.ps1$\" -Model $\"$1$\" -EnvPath $\"%~dp0.env$\"$\r$\n"
  FileWrite $2 "echo.$\r$\n"
  FileWrite $2 "pause$\r$\n"
  FileClose $2

  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME} - Configurar IA local.lnk" "$INSTDIR\configurar-ia.cmd" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0

  ${If} $GmModel == ""
    DetailPrint "IA local nao selecionada: o app usara o modo offline."
    FileOpen $2 "$INSTDIR\.env" w
    FileWrite $2 "# Gerado pelo instalador do Growing Math$\r$\n"
    FileWrite $2 "AI_PROVIDER=auto$\r$\n"
    FileWrite $2 "OLLAMA_BASE_URL=http://127.0.0.1:11434$\r$\n"
    FileClose $2
  ${Else}
    SetDetailsView show
    DetailPrint "Configurando a IA local ($GmModel). Isso pode levar varios minutos..."
    DetailPrint "Nao feche esta janela. O progresso aparece abaixo."

    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-ai.ps1" -Model "$GmModel" -EnvPath "$INSTDIR\.env"'
    Pop $0
    DetailPrint "Bootstrap da IA finalizado (codigo $0). Log completo em $LOCALAPPDATA\GrowingMath\install-ai.log"
  ${EndIf}
!macroend

!macro customUnInstall
  ; O Ollama e o modelo NAO sao removidos: podem ser compartilhados com outros
  ; aplicativos do usuario. Removemos apenas o que o Growing Math criou.
  Delete "$INSTDIR\.env"
  Delete "$INSTDIR\configurar-ia.cmd"
  Delete "$SMPROGRAMS\${PRODUCT_NAME} - Configurar IA local.lnk"
!macroend
