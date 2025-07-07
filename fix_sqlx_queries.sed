# Fix query! macros to use regular query with proper bindings
/sqlx::query!(/,/)/ {
    s/sqlx::query!/sqlx::query/g
}

# Add Row import if not present
1s/^/use sqlx::Row;\n/

