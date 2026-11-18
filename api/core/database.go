package core

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	go_ora "github.com/sijms/go-ora/v2"
)

var DB *sql.DB

type DatabaseConfig struct {
	User     string
	Password string
	Host     string
	Port     string
	Name     string
	Schema   string
}

func LoadDatabaseConfig() *DatabaseConfig {
	return &DatabaseConfig{
		User:     getEnv("ORACLE_USER", "app"),
		Password: getEnv("ORACLE_PASSWORD", ""),
		Host:     getEnv("ORACLE_HOST", "localhost"),
		Port:     getEnv("ORACLE_PORT", "1521"),
		Name:     getEnv("ORACLE_SERVICE", "RESDB"),
		Schema:   getEnv("ORACLE_SCHEMA", "IAMX"),
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// schemaConnector wraps go-ora's connector and runs ALTER SESSION on each new connection
// so unqualified table names resolve to the target schema without changing all SQL.
type schemaConnector struct {
	driver.Connector
	schema string
}

func (sc *schemaConnector) Connect(ctx context.Context) (driver.Conn, error) {
	conn, err := sc.Connector.Connect(ctx)
	if err != nil {
		return nil, err
	}
	alterSQL := fmt.Sprintf("ALTER SESSION SET CURRENT_SCHEMA = %s", sc.schema)
	if execer, ok := conn.(driver.ExecerContext); ok {
		if _, err = execer.ExecContext(ctx, alterSQL, []driver.NamedValue{}); err != nil {
			conn.Close()
			return nil, fmt.Errorf("alter session: %w", err)
		}
	} else if execer, ok := conn.(driver.Execer); ok {
		if _, err = execer.Exec(alterSQL, []driver.Value{}); err != nil {
			conn.Close()
			return nil, fmt.Errorf("alter session: %w", err)
		}
	} else {
		stmt, err := conn.Prepare(alterSQL)
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("alter session prepare: %w", err)
		}
		_, err = stmt.Exec(nil)
		stmt.Close()
		if err != nil {
			conn.Close()
			return nil, fmt.Errorf("alter session exec: %w", err)
		}
	}
	return conn, nil
}

func InitDatabase() error {
	config := LoadDatabaseConfig()

	port, _ := strconv.Atoi(config.Port)
	connStr := go_ora.BuildUrl(config.Host, port, config.Name, config.User, config.Password, nil)

	connector := go_ora.NewConnector(connStr)

	DB = sql.OpenDB(&schemaConnector{Connector: connector, schema: config.Schema})

	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	DB.SetConnMaxLifetime(5 * time.Minute)
	DB.SetConnMaxIdleTime(10 * time.Minute)

	if err := DB.Ping(); err != nil {
		return fmt.Errorf("error pinging database: %w", err)
	}

	log.Printf("✅ Connected to Oracle %s:%s/%s (schema: %s)", config.Host, config.Port, config.Name, config.Schema)
	return nil
}

func CloseDatabase() {
	if DB != nil {
		if err := DB.Close(); err != nil {
			log.Printf("Error closing database: %v", err)
		} else {
			log.Println("✅ Database connection closed")
		}
	}
}

func GetDB() *sql.DB {
	return DB
}

func CheckConnection() error {
	if DB == nil {
		return fmt.Errorf("database connection is nil")
	}
	return DB.Ping()
}
