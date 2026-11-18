import { tx } from "@/lib/i18n";
import Swal from "sweetalert2";

// Default Toast configuration
const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.onmouseenter = Swal.stopTimer;
    toast.onmouseleave = Swal.resumeTimer;
  },
});

// Success toast
export const showSuccess = (title: string, text?: string) => {
  Toast.fire({
    icon: "success",
    title,
    text,
  });
};

// Error toast
export const showError = (title: string, text?: string) => {
  Toast.fire({
    icon: "error",
    title,
    text,
  });
};

// Warning toast
export const showWarning = (title: string, text?: string) => {
  Toast.fire({
    icon: "warning",
    title,
    text,
  });
};

// Info toast
export const showInfo = (title: string, text?: string) => {
  Toast.fire({
    icon: "info",
    title,
    text,
  });
};

// Confirm dialog
export const showConfirm = async (
  title: string,
  text: string,
  confirmButtonText: string = tx("ยืนยัน"),
  cancelButtonText: string = tx("ยกเลิก")
): Promise<boolean> => {
  const result = await Swal.fire({
    title,
    text,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    buttonsStyling: false,
    customClass: {
      confirmButton: "swal-btn-confirm",
      cancelButton: "swal-btn-cancel",
    },
  });
  return result.isConfirmed;
};

// Alert dialog (replacement for alert)
export const showAlert = (title: string, text?: string, icon: "success" | "error" | "warning" | "info" = "info") => {
  return Swal.fire({
    title,
    text,
    icon,
    confirmButtonText: tx("ตกลง"),
    buttonsStyling: false,
    customClass: {
      confirmButton: "swal-btn-confirm",
    },
  });
};

export default Swal;
