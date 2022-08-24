!macro customInstall
  DeleteRegKey HKCR "hiprint"
  WriteRegStr HKCR "hiprint" "" "URL:hiprint"
  WriteRegStr HKCR "hiprint" "URL Protocol" ""
  WriteRegStr HKCR "hiprint\shell" "" ""
  WriteRegStr HKCR "hiprint\shell\Open" "" ""
  WriteRegStr HKCR "hiprint\shell\Open\command" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME} %1"
!macroend

!macro customUnInstall
  DeleteRegKey HKCR "hiprint"
!macroend