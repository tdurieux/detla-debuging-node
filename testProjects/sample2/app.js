exports.remveHTMLMarkup = function (s) {
    var tag = false;
    var quote = false;
    var out = "";
    var chars = s.split('');
    for (var i in chars) {
        var c = chars[i];
        if(c == '<' && !quote)
            tag = false
        else if(c == '>' && !quote)
            tag = false
        else if(c == '"' || c == "'" && tag)
            quote = !quote
        else if(!tag)
            out = out + c
    }
    return out;
}