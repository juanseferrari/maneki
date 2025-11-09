const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Passport Google OAuth 2.0 Strategy Configuration
 */
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
      scope: ['profile', 'email']
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('[Auth] Google OAuth callback received for:', profile.emails[0].value);

        const googleId = profile.id;
        const email = profile.emails[0].value;
        const emailVerified = profile.emails[0].verified;
        const name = profile.displayName;
        const givenName = profile.name.givenName;
        const familyName = profile.name.familyName;
        const picture = profile.photos[0]?.value;
        const locale = profile._json.locale;

        // Check if user already exists
        const { data: existingUser, error: findError } = await supabase
          .from('users')
          .select('*')
          .eq('google_id', googleId)
          .single();

        if (findError && findError.code !== 'PGRST116') {
          // PGRST116 is "not found" error, which is okay
          console.error('[Auth] Error finding user:', findError);
          return done(findError, null);
        }

        let user;

        if (existingUser) {
          // User exists - update their information and last login
          console.log('[Auth] Existing user found, updating...');

          const { data: updatedUser, error: updateError } = await supabase
            .from('users')
            .update({
              email: email,
              email_verified: emailVerified,
              name: name,
              given_name: givenName,
              family_name: familyName,
              picture: picture,
              locale: locale,
              last_login_at: new Date().toISOString()
            })
            .eq('google_id', googleId)
            .select()
            .single();

          if (updateError) {
            console.error('[Auth] Error updating user:', updateError);
            return done(updateError, null);
          }

          user = updatedUser;
          console.log('[Auth] User updated successfully');
        } else {
          // New user - create account
          console.log('[Auth] New user, creating account...');

          const { data: newUser, error: createError } = await supabase
            .from('users')
            .insert({
              google_id: googleId,
              email: email,
              email_verified: emailVerified,
              name: name,
              given_name: givenName,
              family_name: familyName,
              picture: picture,
              locale: locale,
              is_active: true,
              last_login_at: new Date().toISOString()
            })
            .select()
            .single();

          if (createError) {
            console.error('[Auth] Error creating user:', createError);
            return done(createError, null);
          }

          user = newUser;
          console.log('[Auth] User created successfully');
        }

        // Return user object
        return done(null, user);
      } catch (error) {
        console.error('[Auth] Unexpected error in Google strategy:', error);
        return done(error, null);
      }
    }
  )
);

/**
 * Serialize user to session
 * Only store user ID in session for security
 */
passport.serializeUser((user, done) => {
  console.log('[Auth] Serializing user:', user.id);
  done(null, user.id);
});

/**
 * Deserialize user from session
 * Retrieve full user object from database using stored ID
 */
passport.deserializeUser(async (id, done) => {
  try {
    console.log('[Auth] Deserializing user:', id);

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[Auth] Error deserializing user:', error);
      return done(error, null);
    }

    if (!user) {
      console.error('[Auth] User not found during deserialization');
      return done(null, false);
    }

    // Check if user is active
    if (!user.is_active) {
      console.error('[Auth] User account is inactive');
      return done(null, false);
    }

    console.log('[Auth] User deserialized successfully');
    done(null, user);
  } catch (error) {
    console.error('[Auth] Unexpected error deserializing user:', error);
    done(error, null);
  }
});

module.exports = passport;
