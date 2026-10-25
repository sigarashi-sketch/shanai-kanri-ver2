// 重なりの順（z-index）をここで決める（10-25 shoya「名前の小窓が引き出しの裏に出る」）。
//   ・画面の中の引き出し（スキシ・ホームの人事・要員マップ など）は z-50
//   ・名前の小窓はそれより上（80/81）。小窓の中の要約は さらに上（90/91）
export const Z = {
  drawer: 50,
  popupBackdrop: 80,
  popup: 81,
  modalBackdrop: 90,
  modal: 91,
} as const;

export const Z_POPUP = [Z.popupBackdrop, Z.popup] as const;
export const Z_MODAL = [Z.modalBackdrop, Z.modal] as const;
