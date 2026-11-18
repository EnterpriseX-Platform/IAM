package models

import "time"

type User struct {
	ID        int       `json:"id"`
	Username  string    `json:"username"`
	Email     string    `json:"email"`
	CreatedAt time.Time `json:"created_at"`
}

type CreateUserRequest struct {
	Username string `json:"username" validate:"required"`
	Email    string `json:"email" validate:"required,email"`
}

type UpdateUserRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
}

type HealthResponse struct {
	Status   string `json:"status"`
	Database string `json:"database"`
	Time     string `json:"time"`
}

// UserResponse - Response สำหรับ user info จาก "IAMX".user_info + app.USER_INFO
type UserResponse struct {
	UserID    *string `json:"userId,omitempty"`
	FirstName *string `json:"firstName,omitempty"`
	LastName  *string `json:"lastName,omitempty"`
	Email     *string `json:"email,omitempty"`
	Status    *string `json:"status,omitempty"`
}

// CreateUserInfoRequest - Request สำหรับสร้างผู้ใช้ใหม่
type CreateUserInfoRequest struct {
	NationalId  string   `json:"nationalId" validate:"required"`
	Username    string   `json:"username" validate:"required"`
	Email       string   `json:"email" validate:"required,email"`
	FirstNameTH string   `json:"firstNameTH" validate:"required"`
	LastNameTH  string   `json:"lastNameTH" validate:"required"`
	FirstNameEN string   `json:"firstNameEN" validate:"required"`
	LastNameEN  string   `json:"lastNameEN" validate:"required"`
	Phone       string   `json:"phone"`
	Mobile      string   `json:"mobile"`
	Password    string   `json:"password" validate:"required,min=8"`
	Status      bool     `json:"status"`
	Roles       []string `json:"roles"`
}

// UpdateUserInfoRequest - Request สำหรับแก้ไขผู้ใช้
type UpdateUserInfoRequest struct {
	NationalId  string   `json:"nationalId"`
	Username    string   `json:"username"`
	Email       string   `json:"email"`
	FirstNameTH string   `json:"firstNameTH"`
	LastNameTH  string   `json:"lastNameTH"`
	FirstNameEN string   `json:"firstNameEN"`
	LastNameEN  string   `json:"lastNameEN"`
	Phone       string   `json:"phone"`
	Mobile      string   `json:"mobile"`
	Password    string   `json:"password,omitempty"`
	Status      bool     `json:"status"`
	Roles       []string `json:"roles"`
}
