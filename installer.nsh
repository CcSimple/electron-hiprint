!macro customInstall
  ; 如果安装包路径下存在 config.json 文件，则将其复制到用户的 AppData 目录下
  IfFileExists "$EXEDIR\config.json" 0 +3
  CreateDirectory "$APPDATA\electron-hiprint"
  CopyFiles "$EXEDIR\config.json" "$APPDATA\electron-hiprint\config.json"
  ; 删除旧的 hiprint 伪协议
  DeleteRegKey HKCR "hiprint"
  ; 注册 hiprint 伪协议
  WriteRegStr HKCR "hiprint" "" "URL:hiprint"
  WriteRegStr HKCR "hiprint" "URL Protocol" ""
  WriteRegStr HKCR "hiprint\shell" "" ""
  WriteRegStr HKCR "hiprint\shell\Open" "" ""
  WriteRegStr HKCR "hiprint\shell\Open\command" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME} %1"
!macroend

!macro customUnInstall
  ; 询问用户是否需要清除本地缓存数据
  MessageBox MB_YESNO|MB_ICONQUESTION "是否同时删除本地缓存数据？$\n这将清除所有设置和历史记录。" IDNO SkipDataDeletion
  RMDir /r "$APPDATA\electron-hiprint"
  SkipDataDeletion:
  ; 删除 hiprint 伪协议
  DeleteRegKey HKCR "hiprint"
!macroend