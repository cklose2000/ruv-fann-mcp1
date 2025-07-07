#!/usr/bin/env python3
"""
Fix SQLx syntax after replacing query! with query
Converts from query!(sql, param) to query(sql).bind(param)
"""

import re
import sys

def fix_sqlx_syntax(file_path):
    """Fix SQLx query syntax in the file"""
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Pattern to match sqlx::query with two arguments
    # This regex looks for sqlx::query( ... "#, tool)
    pattern = r'(sqlx::query\(\s*r#"[^"]*"#),\s*(\w+)\s*\)'
    
    # Replace with .bind() syntax
    def replace_query(match):
        query_part = match.group(1)
        param = match.group(2)
        return f'{query_part})\n        .bind({param})'
    
    # Apply the fix
    fixed_content = re.sub(pattern, replace_query, content, flags=re.MULTILINE | re.DOTALL)
    
    # Also fix the fetch_one/fetch_all that might be on the wrong line
    fixed_content = re.sub(
        r'\)\s*\n\s*\)\s*\n\s*\.(fetch_(?:one|all))',
        r')\n        .\1',
        fixed_content
    )
    
    # Write the fixed content
    with open(file_path, 'w') as f:
        f.write(fixed_content)
    
    print(f"✅ Fixed SQLx syntax in {file_path}")
    
    # Count how many queries were fixed
    original_count = content.count('sqlx::query(')
    fixed_count = fixed_content.count('.bind(')
    print(f"   Fixed {fixed_count} queries")

if __name__ == "__main__":
    file_path = "/home/cklose/ruv-fann-mcp1/swarm/src/agent.rs"
    
    # Create backup
    import shutil
    backup_path = file_path + ".bak2"
    shutil.copy(file_path, backup_path)
    print(f"📋 Created backup at {backup_path}")
    
    fix_sqlx_syntax(file_path)
    print("\nYou can now run: cargo build --release")